import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import { createRequire } from "node:module";
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
import { UiDisplaySchema, NODEBOOKS_UI_MIME } from "@nodebooks/notebook-schema";

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

// Best-effort rewrite to make top-level declarations idempotent and persistent.
// Converts top-level `const/let/var x = ...` to `globalThis.x = ...` (dropping TS types),
// and `function f(...)` to `globalThis.f = function f(...)`,
// `class C ...` to `globalThis.C = class C ...`.
// This allows re-running a cell without "already declared" errors and makes
// definitions visible to following cells via the shared context.
const rewriteTopLevelDeclarations = (source: string, _lang: "js" | "ts") => {
  const lines = source.split(/\r?\n/);
  let depth = 0;
  let inBlockComment = false;
  let inString: false | '"' | "'" | "`" = false;
  const result: string[] = [];

  // Collect a top-level variable initializer across multiple lines until the
  // terminating semicolon that is not inside (), [], {} or strings/comments.
  const replaceVarMultiline = (
    startLineIdx: number
  ): { text: string; consumed: number } | null => {
    const line = lines[startLineIdx] ?? "";
    const exportRe = /^\s*export\s+/;
    const exportPrefix = exportRe.test(line) ? line.match(exportRe)![0] : "";
    const rest = exportPrefix ? line.slice(exportPrefix.length) : line;
    const varRe =
      /^(\s*)(const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?\s*=\s*/;
    const m = rest.match(varRe);
    if (!m) return null;
    const indent = m[1] ?? "";
    const name = m[3];
    // Start with the remainder of the first line after the initializer '='
    const chunks: string[] = [rest.slice(m[0].length)];

    let iLine = startLineIdx;
    let iChar = 0;
    let inStr: false | '"' | "'" | "`" = false;
    let inLineComment = false;
    let inBlkComment = false;
    let depthParen = 0;
    let depthBracket = 0;
    let depthBrace = 0;
    let found = false;
    let tail = "";

    // We already consumed the prefix on the first line, continue scanning from there
    let remainder = chunks[0] ?? "";
    while (true) {
      const text = remainder;
      iChar = 0;
      while (iChar < text.length) {
        const ch = text[iChar]!;
        const next = text[iChar + 1];
        if (inLineComment) {
          // comment to EOL
          break;
        }
        if (inBlkComment) {
          if (ch === "*" && next === "/") {
            inBlkComment = false;
            iChar += 2;
            continue;
          }
          iChar++;
          continue;
        }
        if (inStr) {
          if (ch === "\\") {
            iChar += 2;
            continue;
          }
          if ((inStr === "`" && ch === "`") || ch === inStr) {
            inStr = false;
            iChar++;
            continue;
          }
          iChar++;
          continue;
        }
        if (ch === "/" && next === "/") {
          inLineComment = true;
          iChar += 2;
          continue;
        }
        if (ch === "/" && next === "*") {
          inBlkComment = true;
          iChar += 2;
          continue;
        }
        if (ch === '"' || ch === "'") {
          inStr = ch as '"' | "'";
          iChar++;
          continue;
        }
        if (ch === "`") {
          inStr = "`";
          iChar++;
          continue;
        }
        if (ch === "(") depthParen++;
        else if (ch === ")") depthParen = Math.max(0, depthParen - 1);
        else if (ch === "[") depthBracket++;
        else if (ch === "]") depthBracket = Math.max(0, depthBracket - 1);
        else if (ch === "{") depthBrace++;
        else if (ch === "}") depthBrace = Math.max(0, depthBrace - 1);

        if (
          ch === ";" &&
          depthParen === 0 &&
          depthBracket === 0 &&
          depthBrace === 0
        ) {
          // Split expr on this semicolon
          const before = text.slice(0, iChar);
          const after = text.slice(iChar + 1);
          // Replace the current chunk with the part before the semicolon
          chunks[chunks.length - 1] = before;
          tail = after; // remainder after ; on same line
          found = true;
          break;
        }
        iChar++;
      }
      if (found) break;
      // Consider end-of-line as a terminator via ASI when not inside any
      // grouping and not in string/comment.
      if (
        !inStr &&
        !inBlkComment &&
        !inLineComment &&
        depthParen === 0 &&
        depthBracket === 0 &&
        depthBrace === 0 &&
        // Only permit ASI termination if we've actually consumed
        // some expression content after the '=' across chunks so far.
        chunks.join("").trim().length > 0
      ) {
        found = true; // terminate at end of this line
        break;
      }
      // Move to next line, append newline + full line
      iLine++;
      if (iLine >= lines.length) {
        // No terminating semicolon; treat end-of-file as end
        break;
      }
      const nextLine = lines[iLine] ?? "";
      const nextChunk = "\n" + nextLine;
      chunks.push(nextChunk);
      remainder = nextChunk;
      inLineComment = false;
      // inStr / inBlkComment carry across lines
    }

    const expr = chunks.join("").trimEnd();
    const assign = `${indent}var ${name} = (globalThis.${name} = ${expr});`;
    const remainderText =
      tail && tail.trim().length > 0 ? `\n${indent}${tail.trimStart()}` : "";
    const consumed = iLine - startLineIdx;
    return { text: assign + remainderText, consumed };
  };

  const replaceFunction = (line: string) => {
    const exportRe = /^\s*export\s+/;
    const exportPrefix = exportRe.test(line) ? line.match(exportRe)![0] : "";
    const rest = exportPrefix ? line.slice(exportPrefix.length) : line;
    const fnRe = /^(\s*)function\s+([A-Za-z_$][\w$]*)\s*\(/;
    const m = rest.match(fnRe);
    if (!m) return null;
    const indent = m[1] ?? "";
    const name = m[2];
    return line.replace(
      new RegExp(`^${indent}(?:export\\s+)?function\\s+${name}\\s*\\(`),
      `${indent}globalThis.${name} = function ${name}(`
    );
  };

  const replaceClass = (line: string) => {
    const exportRe = /^\s*export\s+/;
    const exportPrefix = exportRe.test(line) ? line.match(exportRe)![0] : "";
    const rest = exportPrefix ? line.slice(exportPrefix.length) : line;
    const clsRe = /^(\s*)class\s+([A-Za-z_$][\w$]*)\b/;
    const m = rest.match(clsRe);
    if (!m) return null;
    const indent = m[1] ?? "";
    const name = m[2];
    return line.replace(
      new RegExp(`^${indent}(?:export\\s+)?class\\s+${name}\b`),
      `${indent}globalThis.${name} = class ${name}`
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let j = 0;
    while (j < line.length) {
      const ch = line[j];
      const next = line[j + 1];
      if (!inString && !inBlockComment) {
        if (ch === "/" && next === "*") {
          inBlockComment = true;
          j += 2;
          continue;
        }
        if (ch === "/" && next === "/") {
          // rest is comment
          break;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
          inString = ch as '"' | "'" | "`";
          j++;
          continue;
        }
        if (ch === "{") depth++;
        else if (ch === "}") depth = Math.max(0, depth - 1);
      } else if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          j += 2;
          continue;
        }
      } else if (inString) {
        if (ch === "\\") {
          j += 2; // escape
          continue;
        }
        if (ch === inString) {
          inString = false;
        }
      }
      j++;
    }

    if (depth === 0 && !inBlockComment && !inString) {
      const replacedVar = replaceVarMultiline(i);
      if (replacedVar !== null) {
        result.push(replacedVar.text);
        i += replacedVar.consumed; // skip consumed following lines
        continue;
      }
      const replacedFn = replaceFunction(line);
      if (replacedFn !== null) {
        result.push(replacedFn);
        continue;
      }
      const replacedCls = replaceClass(line);
      if (replacedCls !== null) {
        result.push(replacedCls);
        continue;
      }
    }

    result.push(line);
  }

  return result.join("\n");
};

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

    const text = `${formatWithOptions(
      { compact: false, breakLength: 80, colors: false },
      ...args
    )}\n`;
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

  // If value conforms to the structured UI spec, add vendor MIME as well
  const uiParsed = UiDisplaySchema.safeParse(value);
  if (uiParsed.success) {
    data[NODEBOOKS_UI_MIME] = uiParsed.data;
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
  private sandboxRequire: NodeJS.Require | null = null;
  private sandboxFs: typeof fs | null = null;
  private prepareQueue: Promise<void> = Promise.resolve();
  private currentNotebookId: string | null = null;
  private currentEnvKey: string | null = null;
  // Per-runtime view of environment variables exposed to user code via process.env
  private exposedEnv: Record<string, string> = {};

  constructor(options: NotebookRuntimeOptions = {}) {
    this.workspaceRoot = options.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT;
    this.installDeps =
      options.installDependencies ?? defaultInstallDependencies;
    fs.mkdirSync(this.workspaceRoot, { recursive: true });

    this.processProxy = createProcessProxy(
      () => this.sandboxDir ?? this.workspaceRoot,
      () => this.exposedEnv
    );

    const placeholderRequire = createPlaceholderRequire();
    const sandbox: Record<string, unknown> = {
      console: this.console.proxy,
      require: placeholderRequire,
      module: { exports: {} },
      exports: {},
      process: this.processProxy,
      Buffer,
      // Timers
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      // Web/Fetch APIs from host Node.js (Node 20+)
      fetch: (globalThis as unknown as { fetch?: typeof fetch }).fetch?.bind(
        globalThis as unknown as object
      ),
      Headers: (globalThis as unknown as { Headers?: typeof Headers }).Headers,
      Request: (globalThis as unknown as { Request?: typeof Request }).Request,
      Response: (globalThis as unknown as { Response?: typeof Response })
        .Response,
      FormData: (globalThis as unknown as { FormData?: typeof FormData })
        .FormData,
      Blob: (globalThis as unknown as { Blob?: typeof Blob }).Blob,
      File: (globalThis as unknown as { File?: typeof File }).File,
      URL,
      URLSearchParams,
    };

    this.context = vm.createContext(sandbox, {
      codeGeneration: {
        strings: true,
        wasm: false,
      },
    });

    (this.context as Record<string, unknown>).global = this.context;
    (this.context as Record<string, unknown>).globalThis = this.context;

    // Global UI helpers were moved to the '@nodebooks/ui' sandbox module.
    // Users should now `import { UiImage, UiMarkdown, UiHTML, UiJSON, UiCode } from "@nodebooks/ui"`.
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
    // Build the per-notebook environment view exposed to user code via process.env
    const nextEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(env.variables ?? {})) {
      const key = String(k).trim();
      if (!key) continue;
      nextEnv[key] = String(v);
    }
    // Provide non-sensitive defaults for better UX in console coloring
    if (nextEnv.FORCE_COLOR === undefined) nextEnv.FORCE_COLOR = "1";
    this.exposedEnv = nextEnv;

    try {
      await this.ensureEnvironment(notebookId, env);

      const rewritten = rewriteTopLevelDeclarations(code, cell.language);
      const wrapped = wrapForTopLevelAwait(rewritten);
      if (process.env.NB_DEBUG === "1") {
        this.console.proxy.log("[debug] rewritten code:\n" + rewritten);
        this.console.proxy.log("[debug] wrapped code:\n" + wrapped);
      }
      const compiled = await transform(wrapped, {
        loader: cell.language === "ts" ? "ts" : "js",
        format: "cjs",
        target: "es2022",
        sourcemap: false,
        platform: "node",
        supported: { "dynamic-import": false },
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
      // Emit a note when clearing deps so callers can see activity in cell output.
      this.console.proxy.log("[env] Clearing all dependencies (no packages)");
      await fsPromises.rm(nodeModulesPath, { recursive: true, force: true });
      await fsPromises.rm(lockfilePath, { force: true });
      await fsPromises.writeFile(
        metadataPath,
        JSON.stringify({ packagesKey: envKey }, null, 2)
      );
      await writeUiHelpersModule(sandboxDir);
      this.assignSandboxBindings(sandboxDir);
      this.currentNotebookId = notebookId;
      this.currentEnvKey = envKey;
      return;
    }

    const hasNodeModules = await pathExists(nodeModulesPath);

    if (packagesChanged || !hasNodeModules) {
      const list = Object.entries(packages)
        .map(([n, v]) => `${n}@${v}`)
        .join(", ");
      this.console.proxy.log(
        list.length > 0
          ? `[env] Installing dependencies: ${list}`
          : "[env] Installing dependencies"
      );
      try {
        await this.installDeps(sandboxDir, packages);
        this.console.proxy.log("[env] Install complete");
      } catch (error) {
        let message: string;
        if (error && typeof error === "object" && "stderr" in error) {
          const errObj = error as { stderr?: unknown; message?: unknown };
          message = String(
            errObj.stderr ?? errObj.message ?? "Unknown installation error"
          );
        } else if (error instanceof Error) {
          message = error.message;
        } else {
          message = "Unknown installation error";
        }
        this.console.proxy.error(`[env] Install failed: ${message}`);
        throw new Error(
          `Failed to install notebook dependencies: ${message}`.trim()
        );
      }
    }

    await fsPromises.writeFile(
      metadataPath,
      JSON.stringify({ packagesKey: envKey }, null, 2)
    );

    await writeUiHelpersModule(sandboxDir);

    this.assignSandboxBindings(sandboxDir);
    this.currentNotebookId = notebookId;
    this.currentEnvKey = envKey;
  }

  private assignSandboxBindings(sandboxDir: string) {
    const sandboxFs = createSandboxFs(sandboxDir);
    const sandboxRequire = createSandboxRequire(
      sandboxDir,
      sandboxFs,
      this.processProxy
    );

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

// Alternate wrapper that preserves side-effects and reliably returns the value
// of the last expression statement without breaking multi-line expressions.
//
// Strategy:
// - Split off top-level import declarations to keep them at file scope.
// - Treat the remaining code as a single string and scan it to find the last
//   top-level expression statement (depth-aware, comment/string-safe).
// - Replace that statement with an assignment to a sentinel variable declared
//   in the IIFE scope, then return that sentinel at the end. If no expression
//   statement is found, just execute the body and return undefined.
const wrapForTopLevelAwait = (source: string): string => {
  const lines = source.split(/\r?\n/);
  const topImports: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const t = raw.trimStart();
    if (t.startsWith("import") && !t.startsWith("import(")) {
      const block: string[] = [raw];
      let j = i;
      let ended = /;\s*$/.test(raw);
      while (!ended && j + 1 < lines.length) {
        j++;
        block.push(lines[j] ?? "");
        if (/;\s*$/.test(lines[j] ?? "")) {
          ended = true;
          break;
        }
      }
      topImports.push(block.join("\n"));
      i = j;
      continue;
    }
    rest.push(raw);
  }

  const header = topImports.length > 0 ? `${topImports.join("\n")}\n` : "";

  const isControlStart = (s: string) =>
    /^(?:if|for|while|switch|try|catch|finally|with|else|class|function|const|let|var|export|import|return|throw|break|continue|case|default)\b/.test(
      s.trimStart()
    );

  const bodyText = rest.join("\n");

  // Scan bodyText to collect statements terminated by semicolons that are not
  // inside parentheses (so we ignore `for(;;)` headers). We allow braces and
  // brackets so expressions inside blocks are considered.
  type Range = { start: number; end: number };
  const statements: Range[] = [];
  let stmtStart = 0; // coarse start (previous semicolon end)
  let realStmtStart = 0; // refined start (after braces, etc.)
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inString: false | '"' | "'" | "`" = false;
  let paren = 0,
    bracket = 0,
    brace = 0;

  const commitStatement = (endExclusive: number) => {
    const s = bodyText.slice(realStmtStart, endExclusive);
    if (s.trim().length > 0) {
      statements.push({ start: realStmtStart, end: endExclusive });
    }
    stmtStart = endExclusive;
    realStmtStart = endExclusive;
  };

  while (i < bodyText.length) {
    const ch = bodyText[i]!;
    const next = bodyText[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if ((inString === "`" && ch === "`") || ch === inString) {
        inString = false;
        i++;
        continue;
      }
      i++;
      continue;
    }

    // Not in string/comment
    if (ch === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = ch as '"' | "'";
      i++;
      continue;
    }
    if (ch === "`") {
      inString = "`";
      i++;
      continue;
    }

    if (ch === "(") paren++;
    else if (ch === ")") paren = Math.max(0, paren - 1);
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket = Math.max(0, bracket - 1);
    else if (ch === "{") brace++;
    else if (ch === "}") brace = Math.max(0, brace - 1);

    // When we're not inside parentheses, treat braces as statement boundaries
    if (paren === 0 && (ch === "{" || ch === "}")) {
      realStmtStart = i + 1;
    }

    if (ch === ";" && paren === 0) {
      commitStatement(i + 1);
      i++;
      continue;
    }

    i++;
  }

  if (stmtStart < bodyText.length) {
    commitStatement(bodyText.length);
  }

  // Choose the last statement that looks like an expression statement.
  let chosen: Range | null = null;
  for (let k = statements.length - 1; k >= 0; k--) {
    const { start, end } = statements[k]!;
    const snippet = bodyText.slice(start, end).trim();
    if (snippet === "") continue;
    if (isControlStart(snippet)) continue;
    // Ignore pure closers or stray punctuation
    if (/^[)\]}\s;]+$/.test(snippet)) continue;
    chosen = { start, end };
    break;
  }

  if (!chosen) {
    // Nothing to capture — return body as-is within the IIFE
    const body = bodyText;
    return `${header}(async()=>{\n${body}\n})()`;
  }

  const resultVar = "__nodebooks_result__";
  const start = chosen.start;
  const end = chosen.end;
  const stmt = bodyText.slice(start, end);
  const expr = stmt.replace(/;\s*$/, "");

  const newBodyText = `${bodyText.slice(0, start)}${resultVar} = (${expr});${bodyText.slice(end)}`;

  const body = [`let ${resultVar};`, newBodyText, `return ${resultVar}`]
    .filter(Boolean)
    .join("\n");
  return `${header}(async()=>{\n${body}\n})()`;
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

// Provide a lightweight helper package '@nodebooks/ui' inside the sandbox
const writeUiHelpersModule = async (sandboxDir: string) => {
  const pkgDir = join(sandboxDir, "node_modules", "@nodebooks", "ui");
  await fsPromises.mkdir(pkgDir, { recursive: true });

  const pkgJsonPath = join(pkgDir, "package.json");
  const indexPath = join(pkgDir, "index.js");
  const dtsPath = join(pkgDir, "index.d.ts");

  const pkgJson = {
    name: "@nodebooks/ui",
    version: "0.0.0",
    main: "index.js",
    types: "index.d.ts",
  };

  const indexJs = `"use strict";
function UiImage(srcOrOpts, opts) {
  if (srcOrOpts && typeof srcOrOpts === "object" && !Array.isArray(srcOrOpts) && "src" in srcOrOpts) {
    return Object.assign({ ui: "image" }, srcOrOpts);
  }
  return Object.assign({ ui: "image", src: srcOrOpts }, opts || {});
}
function UiMarkdown(markdown) { return { ui: "markdown", markdown }; }
function UiHTML(html) { return { ui: "html", html }; }
function UiJSON(json, opts) { return Object.assign({ ui: "json", json }, opts || {}); }
function UiCode(code, opts) { return Object.assign({ ui: "code", code }, opts || {}); }
function UiTable(rowsOrOpts, opts) {
  if (Array.isArray(rowsOrOpts)) {
    return Object.assign({ ui: "table", rows: rowsOrOpts }, opts || {});
  }
  if (rowsOrOpts && typeof rowsOrOpts === "object" && "rows" in rowsOrOpts) {
    return Object.assign({ ui: "table" }, rowsOrOpts);
  }
  throw new Error("UiTable expects an array of rows or an options object with { rows }");
}
function UiDataSummary(opts) {
  if (opts && typeof opts === "object") return Object.assign({ ui: "dataSummary" }, opts);
  throw new Error("UiDataSummary expects an options object");
}
function UiAlert(opts) {
  if (opts && typeof opts === "object") return Object.assign({ ui: "alert" }, opts);
  throw new Error("UiAlert expects an options object");
}
function UiBadge(textOrOpts, opts) {
  if (textOrOpts && typeof textOrOpts === "object" && "text" in textOrOpts) {
    return Object.assign({ ui: "badge" }, textOrOpts);
  }
  return Object.assign({ ui: "badge", text: String(textOrOpts ?? "") }, opts || {});
}
function UiMetric(valueOrOpts, opts) {
  if (valueOrOpts && typeof valueOrOpts === "object" && "value" in valueOrOpts) {
    return Object.assign({ ui: "metric" }, valueOrOpts);
  }
  return Object.assign({ ui: "metric", value: valueOrOpts }, opts || {});
}
function UiProgress(valueOrOpts, opts) {
  if (valueOrOpts && typeof valueOrOpts === "object") {
    return Object.assign({ ui: "progress" }, valueOrOpts);
  }
  return Object.assign({ ui: "progress", value: valueOrOpts }, opts || {});
}
function UiSpinner(opts) {
  if (opts && typeof opts === "object") return Object.assign({ ui: "spinner" }, opts);
  return { ui: "spinner" };
}
module.exports = { UiImage, UiMarkdown, UiHTML, UiJSON, UiCode, UiTable, UiDataSummary, UiAlert, UiBadge, UiMetric, UiProgress, UiSpinner };
`;

  const indexDts = `export type UiImageOptions = {
  alt?: string;
  width?: number | string;
  height?: number | string;
  fit?: "contain" | "cover" | "fill" | "none" | "scale-down";
  borderRadius?: number;
  mimeType?: string;
};
export declare function UiImage(src: string, opts?: UiImageOptions): { ui: "image" } & UiImageOptions & { src: string };
export declare function UiImage(opts: { ui?: "image"; src: string } & UiImageOptions): { ui: "image" } & UiImageOptions & { src: string };
export declare function UiMarkdown(markdown: string): { ui: "markdown"; markdown: string };
export declare function UiHTML(html: string): { ui: "html"; html: string };
export type UiJsonOptions = { collapsed?: boolean; maxDepth?: number };
export declare function UiJSON(json: unknown, opts?: UiJsonOptions): { ui: "json"; json: unknown } & UiJsonOptions;
export type UiCodeOptions = { language?: string; wrap?: boolean };
export declare function UiCode(code: string, opts?: UiCodeOptions): { ui: "code"; code: string } & UiCodeOptions;
export type UiTableColumn = { key: string; label?: string; align?: "left" | "center" | "right" };
export type UiTableOptions = {
  columns?: UiTableColumn[];
  sort?: { key: string; direction?: "asc" | "desc" };
  page?: { index?: number; size?: number };
  density?: "compact" | "normal" | "spacious";
};
export declare function UiTable(rows: Array<Record<string, unknown>>, opts?: UiTableOptions): { ui: "table"; rows: Array<Record<string, unknown>> } & UiTableOptions;
export declare function UiTable(opts: { ui?: "table"; rows: Array<Record<string, unknown>> } & UiTableOptions): { ui: "table"; rows: Array<Record<string, unknown>> } & UiTableOptions;
export type UiDataSummaryOptions = {
  title?: string;
  schema?: Array<{ name: string; type: string; nullable?: boolean }>;
  stats?: Record<string, { count?: number; distinct?: number; min?: number; max?: number; mean?: number; median?: number; p25?: number; p75?: number; stddev?: number; nulls?: number }>;
  sample?: Array<Record<string, unknown>>;
  note?: string;
};
export declare function UiDataSummary(opts: UiDataSummaryOptions): { ui: "dataSummary" } & UiDataSummaryOptions;
export type UiAlertOptions = { level?: "info" | "success" | "warn" | "error"; title?: string; text?: string; html?: string };
export declare function UiAlert(opts: UiAlertOptions): { ui: "alert" } & UiAlertOptions;
export type UiBadgeOptions = { color?: "neutral" | "info" | "success" | "warn" | "error" | "brand" };
export declare function UiBadge(text: string, opts?: UiBadgeOptions): { ui: "badge"; text: string } & UiBadgeOptions;
export declare function UiBadge(opts: { ui?: "badge"; text: string } & UiBadgeOptions): { ui: "badge"; text: string } & UiBadgeOptions;
export type UiMetricOptions = { label?: string; unit?: string; delta?: number; helpText?: string };
export declare function UiMetric(value: string | number, opts?: UiMetricOptions): { ui: "metric"; value: string | number } & UiMetricOptions;
export declare function UiMetric(opts: { ui?: "metric"; value: string | number } & UiMetricOptions): { ui: "metric"; value: string | number } & UiMetricOptions;
export type UiProgressOptions = { label?: string; max?: number; indeterminate?: boolean };
export declare function UiProgress(value: number, opts?: UiProgressOptions): { ui: "progress"; value: number } & UiProgressOptions;
export declare function UiProgress(opts: { ui?: "progress"; value?: number; max?: number; indeterminate?: boolean }): { ui: "progress" } & UiProgressOptions & { value?: number };
export type UiSpinnerOptions = { label?: string; size?: number | "sm" | "md" | "lg" };
export declare function UiSpinner(opts?: UiSpinnerOptions): { ui: "spinner" } & UiSpinnerOptions;
`;

  await fsPromises.writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2));
  await fsPromises.writeFile(indexPath, indexJs);
  await fsPromises.writeFile(dtsPath, indexDts);
};

const pathExists = async (filePath: string) => {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const createPlaceholderRequire = (): NodeJS.Require => {
  const base = createRequire(import.meta.url);
  const placeholder = ((_specifier: string) => {
    throw new Error("Notebook runtime is not initialized yet");
  }) as unknown as NodeJS.Require;

  const resolveFn = ((request: string, options?: unknown) => {
    return base.resolve(request, options as never);
  }) as NodeJS.Require["resolve"];
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
  fsModule: typeof fs,
  processProxy: NodeJS.Process
): NodeJS.Require => {
  const entry = join(root, "__runtime__.cjs");
  const base = createRequire(entry);

  const sandboxRequire = ((specifier: string) => {
    if (specifier === "fs" || specifier === "node:fs") {
      return fsModule;
    }
    if (specifier === "fs/promises" || specifier === "node:fs/promises") {
      return fsModule.promises;
    }
    if (specifier === "process" || specifier === "node:process") {
      return processProxy;
    }
    if (specifier === "child_process" || specifier === "node:child_process") {
      throw new Error(
        "Access to child_process is disabled in NodeBooks runtime"
      );
    }
    return base(specifier);
  }) as unknown as NodeJS.Require;

  const resolveFn = ((request: string, options?: unknown) => {
    return base.resolve(request, options as never);
  }) as NodeJS.Require["resolve"];
  if (base.resolve.paths) {
    resolveFn.paths = base.resolve.paths.bind(base.resolve);
  }

  sandboxRequire.resolve = resolveFn;
  sandboxRequire.cache = base.cache;
  sandboxRequire.main = base.main;
  sandboxRequire.extensions = base.extensions;
  return sandboxRequire;
};

const createProcessProxy = (
  getCwd: () => string,
  getEnv: () => Record<string, string>
): NodeJS.Process => {
  const ttyLike = <T extends NodeJS.WriteStream>(stream: T): T => {
    // Present a TTY-like stream to libraries that check isTTY
    return new Proxy(stream, {
      get(sTarget, sProp, sReceiver) {
        if (sProp === "isTTY") {
          return true;
        }
        const sVal = Reflect.get(sTarget, sProp, sReceiver);
        if (typeof sVal === "function") return sVal.bind(sTarget);
        return sVal;
      },
    });
  };

  // A proxy for process.env that only exposes the provided env object.
  const createEnvProxy = () =>
    new Proxy(Object.create(null) as Record<string, string>, {
      get(_t, prop: string | symbol) {
        if (typeof prop !== "string") return undefined;
        const env = getEnv();
        return env[prop];
      },
      set(_t, prop: string | symbol, value) {
        if (typeof prop !== "string") return false;
        const env = getEnv();
        env[prop] = String(value);
        return true;
      },
      has(_t, prop: string | symbol) {
        if (typeof prop !== "string") return false;
        const env = getEnv();
        return Object.prototype.hasOwnProperty.call(env, prop);
      },
      deleteProperty(_t, prop: string | symbol) {
        if (typeof prop !== "string") return false;
        const env = getEnv();

        delete env[prop];
        return true;
      },
      ownKeys() {
        const env = getEnv();
        return Reflect.ownKeys(env);
      },
      getOwnPropertyDescriptor(_t, prop: string | symbol) {
        if (typeof prop !== "string") return undefined;
        const env = getEnv();
        if (!Object.prototype.hasOwnProperty.call(env, prop)) return undefined;
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: env[prop],
        };
      },
    });

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
      if (prop === "stdout") {
        return ttyLike(target.stdout as NodeJS.WriteStream);
      }
      if (prop === "stderr") {
        return ttyLike(target.stderr as NodeJS.WriteStream);
      }
      if (prop === "env") {
        return createEnvProxy();
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

const sanitizeFsArgs = (method: string, args: unknown[], root: string) => {
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
  if (target === normalizedRoot || target.startsWith(normalizedRoot + sep)) {
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
    await fsPromises.rm(join(cwd, "node_modules"), {
      recursive: true,
      force: true,
    });
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
