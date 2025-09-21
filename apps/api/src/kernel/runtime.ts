import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import { createRequire, type NodeRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatWithOptions, inspect, promisify } from "node:util";
import vm from "node:vm";
import { transform } from "esbuild";

const execFileAsync = promisify(execFile);
const DEFAULT_WORKSPACE_ROOT = join(tmpdir(), "nodebooks-runtime");
import type {
  CodeCell,
  NotebookEnv,
  NotebookOutput,
  StreamOutput,
  OutputExecution,
} from "@nodebooks/notebook-schema";

const DEFAULT_TIMEOUT_MS = 10_000;

interface NotebookRuntimeOptions {
  workspaceRoot?: string;
  installDependencies?: (
    cwd: string,
    packages: Record<string, string>
  ) => Promise<void>;
}

interface ExecuteOptions {
  cell: CodeCell;
  code: string;
  notebookId: string;
  env: NotebookEnv;
  onStream?: (output: StreamOutput) => void;
  timeoutMs?: number;
}

interface ExecuteResult {
  outputs: NotebookOutput[];
  execution: OutputExecution;
}

class RuntimeConsole {
  private emitter: ((name: StreamOutput["name"], text: string) => void) | null =
    null;

  readonly proxy: Console = Object.assign(Object.create(console), {
    log: (...args: unknown[]) => {
      this.emit("stdout", args);
    },
    info: (...args: unknown[]) => {
      this.emit("stdout", args);
    },
    warn: (...args: unknown[]) => {
      this.emit("stderr", args);
    },
    error: (...args: unknown[]) => {
      this.emit("stderr", args);
    },
    debug: (...args: unknown[]) => {
      this.emit("stdout", args);
    },
  }) as Console;

  setEmitter(
    emitter: ((name: StreamOutput["name"], text: string) => void) | null
  ) {
    this.emitter = emitter;
  }

  private emit(name: StreamOutput["name"], args: unknown[]) {
    if (!this.emitter) {
      return;
    }

    const text = `${formatWithOptions({ compact: false, breakLength: 80 }, ...args)}\n`;
    this.emitter(name, text);
  }
}

const createExecutionError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "Error",
    message: typeof error === "string" ? error : inspect(error),
  };
};

const toDisplayData = (value: unknown) => {
  const outputs: NotebookOutput[] = [];

  if (typeof value === "undefined") {
    return outputs;
  }

  const plain = inspect(value, { depth: 4, colors: false });

  const data: Record<string, unknown> = {
    "text/plain": plain,
  };

  try {
    const json = JSON.stringify(value);
    if (json) {
      data["application/json"] = JSON.parse(json);
    }
  } catch {
    // Ignore JSON serialization errors.
  }

  const display: NotebookOutput = {
    type: "display_data",
    data,
    metadata: {},
  };

  outputs.push(display);
  return outputs;
};

export class NotebookRuntime {
  private readonly context: vm.Context;
  private readonly console = new RuntimeConsole();
  private readonly workspaceRoot: string;
  private readonly installDeps: (
    cwd: string,
    packages: Record<string, string>
  ) => Promise<void>;
  private readonly processProxy: NodeJS.Process;
  private sandboxDir: string | null = null;
  private sandboxRequire: NodeRequire | null = null;
  private sandboxFs: typeof fs | null = null;
  private prepareQueue: Promise<void> = Promise.resolve();
  private currentNotebookId: string | null = null;
  private currentEnvKey: string | null = null;

  constructor(options: NotebookRuntimeOptions = {}) {
    this.workspaceRoot = options.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT;
    this.installDeps =
      options.installDependencies ?? defaultInstallDependencies;
    fs.mkdirSync(this.workspaceRoot, { recursive: true });

    this.processProxy = createProcessProxy(() =>
      this.sandboxDir ?? this.workspaceRoot
    );

    const placeholderRequire = createPlaceholderRequire();
    const sandbox: Record<string, unknown> = {
      console: this.console.proxy,
      require: placeholderRequire,
      module: { exports: {} },
      exports: {},
      process: this.processProxy,
      Buffer,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
    };

    this.context = vm.createContext(sandbox, {
      codeGeneration: {
        strings: true,
        wasm: false,
      },
    });

    (this.context as Record<string, unknown>).global = this.context;
    (this.context as Record<string, unknown>).globalThis = this.context;
  }

  async execute({
    cell,
    code,
    notebookId,
    env,
    onStream,
    timeoutMs,
  }: ExecuteOptions): Promise<ExecuteResult> {
    const outputs: NotebookOutput[] = [];
    const started = Date.now();
    const timeout = timeoutMs ?? cell.metadata.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    this.console.setEmitter((name, text) => {
      const stream: StreamOutput = { type: "stream", name, text };
      outputs.push(stream);
      onStream?.(stream);
    });

    try {
      await this.ensureEnvironment(notebookId, env);

      const compiled = await transform(code, {
        loader: cell.language === "ts" ? "ts" : "js",
        format: "cjs",
        target: "es2022",
        sourcemap: false,
      });

      if (!this.sandboxDir || !this.sandboxRequire) {
        throw new Error("Notebook runtime environment is not ready");
      }

      const filename = join(this.sandboxDir, `${cell.id}.${cell.language}`);
      const module = { exports: {} };
      (this.context as Record<string, unknown>).module = module;
      (this.context as Record<string, unknown>).exports = module.exports;
      (this.context as Record<string, unknown>).__filename = filename;
      (this.context as Record<string, unknown>).__dirname = dirname(filename);
      (module as Record<string, unknown>).require = this.sandboxRequire;

      const script = new vm.Script(compiled.code, {
        filename,
      });

      let result = script.runInContext(this.context, { timeout });
      if (result && typeof (result as Promise<unknown>).then === "function") {
        result = await withTimeout(result as Promise<unknown>, timeout);
      }

      const displayOutputs = toDisplayData(result);
      outputs.push(...displayOutputs);

      const ended = Date.now();
      return {
        outputs,
        execution: {
          started,
          ended,
          status: "ok",
        },
      } satisfies ExecuteResult;
    } catch (error) {
      const ended = Date.now();
      const details = createExecutionError(error);
      outputs.push({
        type: "error",
        ename: details.name,
        evalue: details.message,
        traceback: details.stack ? details.stack.split("\n") : [],
      });
      return {
        outputs,
        execution: {
          started,
          ended,
          status: "error",
          error: details,
        },
      } satisfies ExecuteResult;
    } finally {
      this.console.setEmitter(null);
    }
  }

  private async ensureEnvironment(
    notebookId: string,
    env: NotebookEnv
  ): Promise<void> {
    const packages = sanitizePackages(env.packages ?? {});
    const envKey = createPackagesKey(packages);

    if (
      this.currentNotebookId === notebookId &&
      this.currentEnvKey === envKey &&
      this.sandboxRequire
    ) {
      return;
    }

    this.prepareQueue = this.prepareQueue.then(async () => {
      await this.prepareNotebook(notebookId, packages, envKey);
    });

    await this.prepareQueue;
  }

  private async prepareNotebook(
    notebookId: string,
    packages: Record<string, string>,
    envKey: string
  ): Promise<void> {
    const sandboxDir = join(this.workspaceRoot, notebookId);
    await fsPromises.mkdir(sandboxDir, { recursive: true });

    const packageJsonPath = join(sandboxDir, "package.json");
    const entryPath = join(sandboxDir, "__runtime__.cjs");
    const metadataPath = join(sandboxDir, ".nodebooks-env.json");
    const nodeModulesPath = join(sandboxDir, "node_modules");
    const lockfilePath = join(sandboxDir, "package-lock.json");

    const metadata = await readEnvironmentMetadata(metadataPath);
    const previousKey = metadata?.packagesKey ?? null;
    const packagesChanged = previousKey !== envKey;

    const packageJson = createPackageJson(notebookId, packages);
    await fsPromises.writeFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2)
    );
    await ensureEntryModule(entryPath);

    if (Object.keys(packages).length === 0) {
      await fsPromises.rm(nodeModulesPath, { recursive: true, force: true });
      await fsPromises.rm(lockfilePath, { force: true });
      await fsPromises.writeFile(
        metadataPath,
        JSON.stringify({ packagesKey: envKey }, null, 2)
      );
      this.assignSandboxBindings(sandboxDir);
      this.currentNotebookId = notebookId;
      this.currentEnvKey = envKey;
      return;
    }

    const hasNodeModules = await pathExists(nodeModulesPath);

    if (packagesChanged || !hasNodeModules) {
      try {
        await this.installDeps(sandboxDir, packages);
      } catch (error) {
        const message =
          error && typeof error === "object" && "stderr" in error
            ? String((error as { stderr?: unknown }).stderr || (error as Error).message)
            : error instanceof Error
            ? error.message
            : "Unknown installation error";
        throw new Error(
          `Failed to install notebook dependencies: ${message}`.trim()
        );
      }
    }

    await fsPromises.writeFile(
      metadataPath,
      JSON.stringify({ packagesKey: envKey }, null, 2)
    );

    this.assignSandboxBindings(sandboxDir);
    this.currentNotebookId = notebookId;
    this.currentEnvKey = envKey;
  }

  private assignSandboxBindings(sandboxDir: string) {
    const sandboxFs = createSandboxFs(sandboxDir);
    const sandboxRequire = createSandboxRequire(sandboxDir, sandboxFs);

    this.sandboxDir = sandboxDir;
    this.sandboxFs = sandboxFs;
    this.sandboxRequire = sandboxRequire;

    const target = this.context as Record<string, unknown>;
    target.require = sandboxRequire;
    target.global = this.context;
    target.globalThis = this.context;
  }
}

const sanitizePackages = (packages: Record<string, string>) => {
  const sanitized: Record<string, string> = {};
  for (const [rawName, rawVersion] of Object.entries(packages)) {
    const name = rawName.trim();
    if (!name) {
      continue;
    }
    const version =
      typeof rawVersion === "string" && rawVersion.trim().length > 0
        ? rawVersion.trim()
        : "latest";
    sanitized[name] = version;
  }
  return sanitized;
};

const createPackagesKey = (packages: Record<string, string>) => {
  const entries = Object.keys(packages)
    .sort()
    .map((key) => [key, packages[key]]);
  return JSON.stringify(entries);
};

const createPackageJson = (
  notebookId: string,
  packages: Record<string, string>
) => {
  const safeNameBase = notebookId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const safeName = `notebook-${safeNameBase || "runtime"}`;
  return {
    name: safeName,
    private: true,
    version: "0.0.0",
    type: "commonjs",
    dependencies: packages,
  };
};

const readEnvironmentMetadata = async (filePath: string) => {
  try {
    const raw = await fsPromises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as { packagesKey?: string };
    }
    return null;
  } catch {
    return null;
  }
};

const ensureEntryModule = async (entryPath: string) => {
  try {
    await fsPromises.access(entryPath);
  } catch {
    await fsPromises.writeFile(entryPath, "module.exports = {}\n");
  }
};

const pathExists = async (filePath: string) => {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const createPlaceholderRequire = (): NodeRequire => {
  const base = createRequire(import.meta.url);
  const placeholder = ((specifier: string) => {
    throw new Error("Notebook runtime is not initialized yet");
  }) as NodeRequire;

  const resolveFn = ((request: string, options?: unknown) => {
    return base.resolve(request, options as never);
  }) as NodeRequire["resolve"];
  if (base.resolve.paths) {
    resolveFn.paths = base.resolve.paths.bind(base.resolve);
  }

  placeholder.resolve = resolveFn;
  placeholder.cache = {};
  placeholder.extensions = base.extensions;
  placeholder.main = base.main;
  return placeholder;
};

const createSandboxRequire = (
  root: string,
  fsModule: typeof fs
): NodeRequire => {
  const entry = join(root, "__runtime__.cjs");
  const base = createRequire(entry);

  const sandboxRequire = ((specifier: string) => {
    if (specifier === "fs" || specifier === "node:fs") {
      return fsModule;
    }
    if (specifier === "fs/promises" || specifier === "node:fs/promises") {
      return fsModule.promises;
    }
    if (specifier === "child_process" || specifier === "node:child_process") {
      throw new Error(
        "Access to child_process is disabled in NodeBooks runtime"
      );
    }
    return base(specifier);
  }) as NodeRequire;

  const resolveFn = ((request: string, options?: unknown) => {
    return base.resolve(request, options as never);
  }) as NodeRequire["resolve"];
  if (base.resolve.paths) {
    resolveFn.paths = base.resolve.paths.bind(base.resolve);
  }

  sandboxRequire.resolve = resolveFn;
  sandboxRequire.cache = base.cache;
  sandboxRequire.main = base.main;
  sandboxRequire.extensions = base.extensions;
  return sandboxRequire;
};

const createProcessProxy = (getCwd: () => string): NodeJS.Process => {
  return new Proxy(process, {
    get(target, prop, receiver) {
      if (prop === "cwd") {
        return () => getCwd();
      }
      if (prop === "chdir") {
        return () => {
          throw new Error("process.chdir is disabled in NodeBooks runtime");
        };
      }
      if (prop === "exit") {
        return () => {
          throw new Error("process.exit is disabled in NodeBooks runtime");
        };
      }
      if (prop === "kill") {
        return () => {
          throw new Error("process.kill is disabled in NodeBooks runtime");
        };
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  });
};

const PATH_ARG_MAP: Record<string, number[]> = {
  access: [0],
  accessSync: [0],
  appendFile: [0],
  appendFileSync: [0],
  chmod: [0],
  chmodSync: [0],
  chown: [0],
  chownSync: [0],
  copyFile: [0, 1],
  copyFileSync: [0, 1],
  cp: [0, 1],
  cpSync: [0, 1],
  createReadStream: [0],
  createWriteStream: [0],
  exists: [0],
  existsSync: [0],
  link: [0, 1],
  linkSync: [0, 1],
  lstat: [0],
  lstatSync: [0],
  mkdir: [0],
  mkdirSync: [0],
  mkdtemp: [0],
  mkdtempSync: [0],
  open: [0],
  openSync: [0],
  opendir: [0],
  opendirSync: [0],
  readdir: [0],
  readdirSync: [0],
  readFile: [0],
  readFileSync: [0],
  readlink: [0],
  readlinkSync: [0],
  realpath: [0],
  realpathSync: [0],
  rename: [0, 1],
  renameSync: [0, 1],
  rm: [0],
  rmSync: [0],
  rmdir: [0],
  rmdirSync: [0],
  stat: [0],
  statSync: [0],
  symlink: [0, 1],
  symlinkSync: [0, 1],
  truncate: [0],
  truncateSync: [0],
  unlink: [0],
  unlinkSync: [0],
  utimes: [0],
  utimesSync: [0],
  watch: [0],
  watchFile: [0],
  unwatchFile: [0],
  writeFile: [0],
  writeFileSync: [0],
};

const sanitizeFsArgs = (
  method: string,
  args: unknown[],
  root: string
) => {
  const indices = PATH_ARG_MAP[method];
  if (!indices || indices.length === 0) {
    return args;
  }
  const next = [...args];
  for (const index of indices) {
    if (index >= next.length) {
      continue;
    }
    next[index] = sanitizePathArgument(root, next[index]);
  }
  return next;
};

const sanitizePathArgument = (root: string, value: unknown) => {
  if (typeof value === "string") {
    return ensureWithinRoot(root, value);
  }
  if (value instanceof URL) {
    return ensureWithinRoot(root, fileURLToPath(value));
  }
  if (Buffer.isBuffer(value)) {
    return ensureWithinRoot(root, value.toString());
  }
  return value;
};

const ensureWithinRoot = (root: string, input: string) => {
  const normalizedRoot = resolve(root);
  const target = resolve(normalizedRoot, input);
  if (
    target === normalizedRoot ||
    target.startsWith(normalizedRoot + sep)
  ) {
    return target;
  }
  throw new Error(
    `Access to path "${input}" is not allowed in this notebook runtime`
  );
};

const createSandboxFs = (root: string): typeof fs => {
  const handler: ProxyHandler<typeof fs> = {
    get(target, prop, receiver) {
      if (prop === "promises") {
        const promisesTarget = target.promises;
        return new Proxy(promisesTarget, {
          get(promises, key, receiverPromises) {
            const value = Reflect.get(promises, key, receiverPromises);
            if (typeof value !== "function") {
              return value;
            }
            return (...args: unknown[]) => {
              const sanitized = sanitizeFsArgs(String(key), args, root);
              return Reflect.apply(value, promises, sanitized);
            };
          },
        });
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }
      return (...args: unknown[]) => {
        const sanitized = sanitizeFsArgs(String(prop), args, root);
        return Reflect.apply(value, target, sanitized);
      };
    },
  };

  return new Proxy(fs, handler);
};

const defaultInstallDependencies = async (
  cwd: string,
  packages: Record<string, string>
) => {
  if (Object.keys(packages).length === 0) {
    await fsPromises.rm(join(cwd, "node_modules"), { recursive: true, force: true });
    await fsPromises.rm(join(cwd, "package-lock.json"), { force: true });
    return;
  }

  await execFileAsync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd,
    env: { ...process.env, npm_config_update_notifier: "false" },
  });
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};
