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
// Hook used to stream UI display values from the sandboxed '@nodebooks/ui'
// helper back to the host while a cell is running.
type UiDisplayHook = ((value: unknown) => void) | null;
import type {
  CodeCell,
  NotebookEnv,
  NotebookOutput,
  StreamOutput,
  OutputExecution,
  DisplayDataOutput,
} from "@nodebooks/notebook-schema";
import { UiDisplaySchema, NODEBOOKS_UI_MIME } from "@nodebooks/notebook-schema";
import type {
  UiImage,
  UiJson,
  UiCode,
  UiTable,
  UiDataSummary,
  UiAlert,
  UiBadge,
  UiMetric,
  UiProgress,
  UiSpinner,
} from "@nodebooks/notebook-schema";

const DEFAULT_TIMEOUT_MS = process.env.NODEBOOKS_KERNEL_TIMEOUT_MS ?? 10_000;

export interface NotebookRuntimeOptions {
  workspaceRoot?: string;
  installDependencies?: (
    cwd: string,
    packages: Record<string, string>
  ) => Promise<void>;
}

export interface ExecuteOptions {
  cell: CodeCell;
  code: string;
  notebookId: string;
  env: NotebookEnv;
  onStream?: (output: StreamOutput) => void;
  onDisplay?: (output: DisplayDataOutput) => void;
  timeoutMs?: number;
}

export interface ExecuteResult {
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
        depthBrace === 0
      ) {
        const accumulated = chunks.join("").trim();
        if (accumulated.length > 0) {
          const nextLine = lines[iLine + 1] ?? "";
          const trimmedNext = nextLine.trimStart();
          const isCommentNext =
            trimmedNext.startsWith("//") || trimmedNext.startsWith("/*");
          const firstChar = trimmedNext[0] ?? "";
          const continuesExpression =
            !isCommentNext &&
            trimmedNext.length > 0 &&
            (firstChar === "." ||
              firstChar === "[" ||
              firstChar === "(" ||
              firstChar === "+" ||
              firstChar === "-" ||
              firstChar === "*" ||
              firstChar === "/" ||
              firstChar === "%" ||
              firstChar === "&" ||
              firstChar === "|" ||
              firstChar === "^" ||
              firstChar === "?" ||
              firstChar === ":" ||
              firstChar === "," ||
              firstChar === "!" ||
              firstChar === "=" ||
              firstChar === "<" ||
              firstChar === ">" ||
              trimmedNext.startsWith("??") ||
              trimmedNext.startsWith("?.") ||
              trimmedNext.startsWith("**"));
          if (!continuesExpression) {
            found = true; // terminate at end of this line
            break;
          }
        }
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
    const fnRe =
      /^(\s*)(?:export\s+)?(?:default\s+)?(?:(async)\s+)?function(\s*\*?)\s+([A-Za-z_$][\w$]*)\s*(\()/;
    if (!fnRe.test(line)) return null;
    return line.replace(fnRe, (_, indent, asyncKeyword, star, name, paren) => {
      const asyncPrefix = asyncKeyword ? "async " : "";
      const starSuffix = star ?? "";
      return `${indent}globalThis.${name} = ${asyncPrefix}function${starSuffix} ${name}${paren}`;
    });
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

  // Do not display bare function references (e.g., last expression is a function
  // or async function identifier). Users typically expect values, not function
  // objects like "[AsyncFunction: name]".
  if (typeof value === "function") {
    return outputs;
  }

  // If UI helpers already emitted this object during execution, skip
  // adding it again as the final display value to avoid duplication.
  if (
    value &&
    typeof value === "object" &&
    (value as Record<string, unknown>).__nb_ui_emitted === true
  ) {
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
  // Track timers created during execution so we can await/cleanup them.
  private pendingTimeouts = new Set<unknown>();
  private pendingIntervals = new Set<unknown>();
  private pendingIntervalFirstTick = new Set<unknown>();
  private timeoutWaiters: Array<() => void> = [];
  private intervalWaiters: Array<() => void> = [];
  private intervalDoneWaiters: Array<() => void> = [];

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

    // Timer management so timers scheduled by user code actually run before
    // the cell completes, and to avoid leaking intervals across cells.
    const timers = this.createTimerAPI();

    const sandbox: Record<string, unknown> = {
      console: this.console.proxy,
      require: placeholderRequire,
      module: { exports: {} },
      exports: {},
      process: this.processProxy,
      Buffer,
      // Timers
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
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

  private createTimerAPI() {
    const addTimeout = (h: unknown) => {
      this.pendingTimeouts.add(h);
    };
    const deleteTimeout = (h: unknown) => {
      if (this.pendingTimeouts.delete(h)) {
        this.maybeResolveTimeoutWaiters();
      }
    };
    const addInterval = (h: unknown) => {
      this.pendingIntervals.add(h);
      this.pendingIntervalFirstTick.add(h);
    };
    const deleteInterval = (h: unknown) => {
      this.pendingIntervals.delete(h);
      this.maybeResolveIntervalDoneWaiters();
    };

    const wrappedSetTimeout = (
      fn: (...args: unknown[]) => void,
      delay?: number | undefined,
      ...args: unknown[]
    ) => {
      let handle: unknown = undefined;
      const runner = (...cbArgs: unknown[]) => {
        try {
          fn(...cbArgs);
        } finally {
          deleteTimeout(handle);
        }
      };
      handle = hostSetTimeout(
        runner as (...args: unknown[]) => void,
        delay as number,
        ...args
      );
      addTimeout(handle);
      return handle as NodeJS.Timeout;
    };

    const wrappedClearTimeout = (h: unknown) => {
      deleteTimeout(h);
      return hostClearTimeout(h as NodeJS.Timeout);
    };

    const wrappedSetInterval = (
      fn: (...args: unknown[]) => void,
      delay?: number | undefined,
      ...args: unknown[]
    ) => {
      let handle: unknown = undefined;
      let fired = false;
      const runner = (...cbArgs: unknown[]) => {
        try {
          fn(...cbArgs);
        } finally {
          if (!fired) {
            fired = true;
            this.pendingIntervalFirstTick.delete(handle);
            this.maybeResolveIntervalWaiters();
          }
        }
      };
      handle = hostSetInterval(
        runner as (...args: unknown[]) => void,
        delay as number,
        ...args
      );
      addInterval(handle);
      return handle as NodeJS.Timeout;
    };

    const wrappedClearInterval = (h: unknown) => {
      deleteInterval(h);
      return hostClearInterval(h as NodeJS.Timeout);
    };

    return {
      setTimeout: wrappedSetTimeout,
      clearTimeout: wrappedClearTimeout,
      setInterval: wrappedSetInterval,
      clearInterval: wrappedClearInterval,
    };
  }

  private maybeResolveTimeoutWaiters() {
    if (this.pendingTimeouts.size === 0 && this.timeoutWaiters.length > 0) {
      const waiters = this.timeoutWaiters.slice();
      this.timeoutWaiters = [];
      for (const w of waiters) {
        try {
          w();
        } catch (err) {
          void err;
        }
      }
    }
  }

  private waitForPendingTimeouts(): Promise<void> {
    if (this.pendingTimeouts.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.timeoutWaiters.push(resolve);
    });
  }

  private maybeResolveIntervalWaiters() {
    if (
      this.pendingIntervalFirstTick.size === 0 &&
      this.intervalWaiters.length > 0
    ) {
      const waiters = this.intervalWaiters.slice();
      this.intervalWaiters = [];
      for (const w of waiters) {
        try {
          w();
        } catch (err) {
          void err;
        }
      }
    }
  }

  private waitForIntervalFirstTicks(): Promise<void> {
    if (this.pendingIntervalFirstTick.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.intervalWaiters.push(resolve);
    });
  }

  private maybeResolveIntervalDoneWaiters() {
    if (
      this.pendingIntervals.size === 0 &&
      this.intervalDoneWaiters.length > 0
    ) {
      const list = this.intervalDoneWaiters.slice();
      this.intervalDoneWaiters = [];
      for (const fn of list) {
        try {
          fn();
        } catch (err) {
          void err;
        }
      }
    }
  }

  private waitForNoIntervals(): Promise<void> {
    if (this.pendingIntervals.size === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.intervalDoneWaiters.push(resolve);
    });
  }

  private clearAllScheduledTimers() {
    // Clear any remaining timeouts/intervals created during this execution.
    for (const t of this.pendingTimeouts) {
      try {
        hostClearTimeout(t as NodeJS.Timeout);
      } catch {
        /* noop */
      }
    }
    for (const i of this.pendingIntervals) {
      try {
        hostClearInterval(i as NodeJS.Timeout);
      } catch {
        /* noop */
      }
    }
    this.pendingTimeouts.clear();
    this.pendingIntervals.clear();
    this.pendingIntervalFirstTick.clear();
    // Resolve anyone waiting if no pending remain
    this.maybeResolveTimeoutWaiters();
    this.maybeResolveIntervalWaiters();
    this.maybeResolveIntervalDoneWaiters();
  }

  async execute({
    cell,
    code,
    notebookId,
    env,
    onStream,
    onDisplay,
    timeoutMs,
  }: ExecuteOptions): Promise<ExecuteResult> {
    const outputs: NotebookOutput[] = [];
    const started = Date.now();
    const timeout = timeoutMs ?? cell.metadata.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let softWaitTimedOut = false;

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
      const wrapped =
        cell.language === "ts"
          ? wrapForTopLevelAwaitTsCapture(rewritten)
          : wrapForTopLevelAwait(rewritten);
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

      // Provide a display hook so UI helpers can push outputs mid-cell
      // Provide a display hook for streaming UI from helpers
      const streamDisplay = (value: unknown) => {
        try {
          const ds = toDisplayData(value);
          for (const d of ds) {
            if (d.type === "display_data") {
              (d as DisplayDataOutput).metadata = {
                ...((d as DisplayDataOutput).metadata ?? {}),
                streamed: true,
              };
              try {
                onDisplay?.(d as DisplayDataOutput);
              } catch (err) {
                void err;
              }
            }
            outputs.push(d);
          }
        } catch (err) {
          void err;
        }
      };
      (this.context as Record<string, unknown>).__nodebooks_display =
        streamDisplay;
      // Also set the hook for our intercepted '@nodebooks/ui' module
      (
        this.sandboxRequire as unknown as {
          setUiDisplayHook?: (fn: UiDisplayHook) => void;
        }
      ).setUiDisplayHook?.(streamDisplay);

      const script = new vm.Script(compiled.code, {
        filename,
      });

      let result = script.runInContext(this.context, {
        timeout: Number(timeout),
      });
      if (result && typeof (result as Promise<unknown>).then === "function") {
        result = await withTimeout(result as Promise<unknown>, Number(timeout));
      }

      // If user code scheduled timeouts, wait for them to fire before
      // concluding execution (up to remaining time budget). This makes
      // common patterns like `setTimeout(() => console.log("hi"), 100)`
      // behave intuitively in notebooks.
      try {
        // Allow pending one-shot timers to fire and at least one tick of any
        // intervals, bounded by the original timeout budget.
        let remaining = Math.max(0, Number(timeout) - (Date.now() - started));
        if (remaining > 0) {
          await withTimeout(this.waitForPendingTimeouts(), remaining);
        }
        remaining = Math.max(0, Number(timeout) - (Date.now() - started));
        if (remaining > 0) {
          await withTimeout(this.waitForIntervalFirstTicks(), remaining);
        }
        remaining = Math.max(0, Number(timeout) - (Date.now() - started));
        if (remaining > 0) {
          await withTimeout(this.waitForNoIntervals(), remaining);
        }
      } catch {
        // Soft timeout in the waiting phase (e.g., long setTimeout or uncleared interval)
        softWaitTimedOut = true;
        try {
          const ms = Number(timeout);

          const alert = {
            ui: "alert" as const,
            level: "warn" as const,
            title: "Execution time limit reached",
            text: `The cell reached the ${ms}ms limit while waiting for timeouts/intervals. Pending timers were stopped.`,
          };
          const ds = toDisplayData(alert);
          for (const d of ds) {
            if (d.type === "display_data") {
              (d as DisplayDataOutput).metadata = {
                ...((d as DisplayDataOutput).metadata ?? {}),
                streamed: true,
              };
              try {
                onDisplay?.(d as DisplayDataOutput);
              } catch {
                this.console.proxy.error(
                  `[timeout] Execution hit the ${ms}ms limit while waiting for timers.`
                );
              }
            }
            outputs.push(d);
          }
        } catch (emitErr) {
          void emitErr;
        }
      }

      const displayOutputs = toDisplayData(result);
      outputs.push(...displayOutputs);

      const ended = Date.now();
      return {
        outputs,
        execution: {
          started,
          ended,
          status: softWaitTimedOut ? "error" : "ok",
        },
      } satisfies ExecuteResult;
    } catch (error) {
      const ended = Date.now();
      const details = createExecutionError(error);
      // Friendly timeout notice in output for better UX
      try {
        const msg = String(details.message || "");
        if (/timed\s*out/i.test(msg)) {
          const ms = Number(timeout);
          // Stream a stderr note so it’s always visible in the console area
          try {
            this.console.proxy.error(
              `[timeout] Execution exceeded ${ms}ms and was stopped.`
            );
          } catch {
            /* noop */
          }
          const alert = {
            ui: "alert",
            level: "warn" as const,
            title: "Execution timed out",
            text: `The cell exceeded the ${ms}ms time limit. Pending tasks were stopped.`,
          } as const;
          const extra = toDisplayData(alert);
          outputs.push(...extra);
        }
      } catch {
        /* noop */
      }
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
      // Always clear any leftover timers to avoid leaks across cells.
      try {
        this.clearAllScheduledTimers();
      } catch (err) {
        void err;
      }
      this.console.setEmitter(null);
      // Clean up display hook
      delete (this.context as Record<string, unknown>).__nodebooks_display;
      const reqForCleanup = this.sandboxRequire as unknown as {
        setUiDisplayHook?: (fn: UiDisplayHook) => void;
      } | null;
      reqForCleanup?.setUiDisplayHook?.(null);
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

// Host timer refs for wrappers
const hostSetTimeout = setTimeout;
const hostClearTimeout = clearTimeout;
const hostSetInterval = setInterval;
const hostClearInterval = clearInterval;

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
  const headerBlocks: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const t = raw.trimStart();
    // Hoist top-level imports
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
      headerBlocks.push(block.join("\n"));
      i = j;
      continue;
    }
    // Hoist top-level TypeScript type/interface declarations
    if (/^(?:export\s+)?(?:interface|type)\b/.test(t)) {
      const block: string[] = [raw];
      let j = i;
      if (/^\s*(?:export\s+)?type\b/.test(t)) {
        // Collect until a semicolon at depth 0 of {} nesting
        let depthBraces =
          (raw.match(/\{/g) || []).length - (raw.match(/\}/g) || []).length;
        let ended = /;\s*$/.test(raw) && depthBraces === 0;
        while (!ended && j + 1 < lines.length) {
          j++;
          const ln = lines[j] ?? "";
          block.push(ln);
          depthBraces +=
            (ln.match(/\{/g) || []).length - (ln.match(/\}/g) || []).length;
          if (/;\s*$/.test(ln) && depthBraces === 0) {
            ended = true;
            break;
          }
        }
      } else {
        // interface: collect until matching closing brace
        let depth =
          (raw.match(/\{/g) || []).length - (raw.match(/\}/g) || []).length;
        while (depth > 0 && j + 1 < lines.length) {
          j++;
          const ln = lines[j] ?? "";
          block.push(ln);
          depth +=
            (ln.match(/\{/g) || []).length - (ln.match(/\}/g) || []).length;
        }
      }
      headerBlocks.push(block.join("\n"));
      i = j;
      continue;
    }
    rest.push(raw);
  }

  const header = headerBlocks.length > 0 ? `${headerBlocks.join("\n")}\n` : "";

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

  // Heuristic: if the final expression contains TypeScript generic arrow or
  // complex generic syntax that esbuild may misparse when wrapped, avoid
  // injecting parentheses directly and instead fall back to plain IIFE return.
  const looksGeneric = /<\w+\s*(?:extends\b[^>]*)?>\s*\(/.test(expr);
  if (looksGeneric) {
    const body = [`${bodyText}`, `return (${expr})`].filter(Boolean).join("\n");
    return `${header}(async()=>{\n${body}\n})()`;
  }

  const newBodyText = `${bodyText.slice(0, start)}${resultVar} = (${expr});${bodyText.slice(end)}`;

  const body = [`let ${resultVar};`, newBodyText, `return ${resultVar}`]
    .filter(Boolean)
    .join("\n");
  return `${header}(async()=>{\n${body}\n})()`;
};

// TS-focused wrapper: hoist only top-level imports; keep type/interface in body,
// and reliably capture the last expression statement. Avoids splitting inside
// type alias/object braces by requiring all grouping depths to be zero.
const wrapForTopLevelAwaitTsCapture = (source: string): string => {
  const lines = source.split(/\r?\n/);
  const imports: string[] = [];
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
      imports.push(block.join("\n"));
      i = j;
      continue;
    }
    rest.push(raw);
  }

  const header = imports.length > 0 ? `${imports.join("\n")}\n` : "";
  const bodyText = rest.join("\n");

  type Range = { start: number; end: number };
  const statements: Range[] = [];
  let realStmtStart = 0;
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inString: false | '"' | "'" | "`" = false;
  let paren = 0,
    bracket = 0,
    brace = 0;

  const commit = (endExclusive: number) => {
    const s = bodyText.slice(realStmtStart, endExclusive);
    if (s.trim().length > 0)
      statements.push({ start: realStmtStart, end: endExclusive });
    realStmtStart = endExclusive;
  };

  const isControlStart = (s: string) =>
    /^(?:if|for|while|switch|try|catch|finally|with|else|class|function|const|let|var|export|import|return|throw|break|continue|case|default|interface|type)\b/.test(
      s.trimStart()
    );

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

    // At top level, if a new statement with a control-start keyword begins on this
    // line (e.g., function/class/interface/type/export), commit the previous chunk.
    if (
      paren === 0 &&
      bracket === 0 &&
      brace === 0 &&
      (i === 0 || bodyText[i - 1] === "\n")
    ) {
      const ahead = bodyText.slice(i).trimStart();
      if (
        /^(?:async\s+function|function|class|interface|type|export)\b/.test(
          ahead
        )
      ) {
        if (realStmtStart < i) commit(i);
      }
    }

    if (ch === ";" && paren === 0 && bracket === 0 && brace === 0) {
      commit(i + 1);
      i++;
      continue;
    }
    i++;
  }

  if (realStmtStart < bodyText.length) commit(bodyText.length);

  // Pick last non-control statement
  let chosen: Range | null = null;
  for (let k = statements.length - 1; k >= 0; k--) {
    const { start, end } = statements[k]!;
    const snippet = bodyText.slice(start, end).trim();
    if (snippet === "") continue;
    if (isControlStart(snippet)) continue;
    chosen = { start, end };
    break;
  }

  if (!chosen) {
    return `${header}(async()=>{\n${bodyText}\n})()`;
  }

  const resultVar = "__nodebooks_result__";
  const start = chosen.start;
  const end = chosen.end;
  const stmt = bodyText.slice(start, end);
  const expr = stmt.replace(/;\s*$/, "");
  // Only capture when the last statement is a plain variable reference
  // (identifier or dotted path). Avoid calls, literals, or complex expressions.
  const idRefRe = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
  if (!idRefRe.test(expr.trim())) {
    // Do not capture; just run body
    return `${header}(async()=>{\n${bodyText}\n})()`;
  }
  const newBodyText = `${bodyText.slice(0, start)}${resultVar} = ${expr};${bodyText.slice(end)}`;
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
function __nb_emit(obj){
  try {
    const f = globalThis && (globalThis).___unused ? null : (globalThis.__nodebooks_display);
    if (typeof f === "function") { f(obj); try { if (obj && typeof obj === "object") { obj.__nb_ui_emitted = true; } } catch {}
    }
  } catch {}
}
function UiImage(srcOrOpts, opts) {
  if (srcOrOpts && typeof srcOrOpts === "object" && !Array.isArray(srcOrOpts) && "src" in srcOrOpts) {
    const o = Object.assign({ ui: "image" }, srcOrOpts); __nb_emit(o); return o;
  }
  const o = Object.assign({ ui: "image", src: srcOrOpts }, opts || {}); __nb_emit(o); return o;
}
function UiMarkdown(markdown) { const o = { ui: "markdown", markdown }; __nb_emit(o); return o; }
function UiHTML(html) { const o = { ui: "html", html }; __nb_emit(o); return o; }
function UiJSON(json, opts) { const o = Object.assign({ ui: "json", json }, opts || {}); __nb_emit(o); return o; }
function UiCode(code, opts) { const o = Object.assign({ ui: "code", code }, opts || {}); __nb_emit(o); return o; }
function UiTable(rowsOrOpts, opts) {
  if (Array.isArray(rowsOrOpts)) {
    const o = Object.assign({ ui: "table", rows: rowsOrOpts }, opts || {}); __nb_emit(o); return o;
  }
  if (rowsOrOpts && typeof rowsOrOpts === "object" && "rows" in rowsOrOpts) {
    const o = Object.assign({ ui: "table" }, rowsOrOpts); __nb_emit(o); return o;
  }
  throw new Error("UiTable expects an array of rows or an options object with { rows }");
}
function UiDataSummary(opts) {
  if (opts && typeof opts === "object") { const o = Object.assign({ ui: "dataSummary" }, opts); __nb_emit(o); return o; }
  throw new Error("UiDataSummary expects an options object");
}
function UiAlert(opts) {
  if (opts && typeof opts === "object") { const o = Object.assign({ ui: "alert" }, opts); __nb_emit(o); return o; }
  throw new Error("UiAlert expects an options object");
}
function UiBadge(textOrOpts, opts) {
  if (textOrOpts && typeof textOrOpts === "object" && "text" in textOrOpts) {
    const o = Object.assign({ ui: "badge" }, textOrOpts); __nb_emit(o); return o;
  }
  const o = Object.assign({ ui: "badge", text: String(textOrOpts ?? "") }, opts || {}); __nb_emit(o); return o;
}
function UiMetric(valueOrOpts, opts) {
  if (valueOrOpts && typeof valueOrOpts === "object" && "value" in valueOrOpts) {
    const o = Object.assign({ ui: "metric" }, valueOrOpts); __nb_emit(o); return o;
  }
  const o = Object.assign({ ui: "metric", value: valueOrOpts }, opts || {}); __nb_emit(o); return o;
}
function UiProgress(valueOrOpts, opts) {
  if (valueOrOpts && typeof valueOrOpts === "object") {
    const o = Object.assign({ ui: "progress" }, valueOrOpts); __nb_emit(o); return o;
  }
  const o = Object.assign({ ui: "progress", value: valueOrOpts }, opts || {}); __nb_emit(o); return o;
}
function UiSpinner(opts) {
  if (opts && typeof opts === "object") { const o = Object.assign({ ui: "spinner" }, opts); __nb_emit(o); return o; }
  const o = { ui: "spinner" }; __nb_emit(o); return o;
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
export type UiBadgeOptions = { color?: "neutral" | "info" | "success" | "warn" | "error" };
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

// Option types derived from the shared schema to avoid duplication
type UiImageOptions = Omit<UiImage, "ui" | "src">;
type UiJsonOptions = Omit<UiJson, "ui" | "json">;
type UiCodeOptions = Omit<UiCode, "ui" | "code">;
type UiTableOptions = Omit<UiTable, "ui" | "rows">;
type UiDataSummaryOptions = Omit<UiDataSummary, "ui">;
type UiAlertOptions = Omit<UiAlert, "ui">;
type UiBadgeOptions = Omit<UiBadge, "ui" | "text">;
type UiMetricOptions = Omit<UiMetric, "ui" | "value">;
type UiProgressOptions = Omit<UiProgress, "ui" | "value">;
type UiSpinnerOptions = Omit<UiSpinner, "ui">;

const createSandboxRequire = (
  root: string,
  fsModule: typeof fs,
  processProxy: NodeJS.Process
): NodeJS.Require & { setUiDisplayHook: (fn: UiDisplayHook) => void } => {
  const entry = join(root, "__runtime__.cjs");
  const base = createRequire(entry);
  let uiDisplayHook: UiDisplayHook = null;

  const sandboxRequire = ((specifier: string) => {
    // Intercept our virtual UI helper package to inject a live display hook
    if (specifier === "@nodebooks/ui") {
      const emit = (obj: unknown) => {
        try {
          uiDisplayHook?.(obj);
        } catch {
          /* noop */
        }
      };
      const tag = <T>(o: T) => {
        try {
          if (o && typeof o === "object") {
            (o as Record<string, unknown>).__nb_ui_emitted = true;
          }
        } catch (err) {
          void err;
        }
        return o;
      };
      return {
        UiImage: (
          srcOrOpts: string | ({ src: string } & UiImageOptions),
          opts?: UiImageOptions
        ) => {
          const o =
            srcOrOpts &&
            typeof srcOrOpts === "object" &&
            !Array.isArray(srcOrOpts) &&
            "src" in srcOrOpts
              ? { ui: "image", ...srcOrOpts }
              : { ui: "image", src: srcOrOpts, ...(opts || {}) };
          emit(o);
          return tag(o);
        },
        UiMarkdown: (markdown: string) => {
          const o = { ui: "markdown", markdown };
          emit(o);
          return tag(o);
        },
        UiHTML: (html: string) => {
          const o = { ui: "html", html };
          emit(o);
          return tag(o);
        },
        UiJSON: (json: unknown, opts?: UiJsonOptions) => {
          const o = { ui: "json", json, ...(opts || {}) };
          emit(o);
          return tag(o);
        },
        UiCode: (code: string, opts?: UiCodeOptions) => {
          const o = { ui: "code", code, ...(opts || {}) };
          emit(o);
          return tag(o);
        },
        UiTable: (
          rowsOrOpts:
            | Array<Record<string, unknown>>
            | ({ rows: Array<Record<string, unknown>> } & UiTableOptions),
          opts?: UiTableOptions
        ) => {
          const o = Array.isArray(rowsOrOpts)
            ? { ui: "table", rows: rowsOrOpts, ...(opts || {}) }
            : { ui: "table", ...(rowsOrOpts || {}) };
          emit(o);
          return tag(o);
        },
        UiDataSummary: (opts: UiDataSummaryOptions) => {
          const o = { ui: "dataSummary", ...(opts || {}) };
          emit(o);
          return tag(o);
        },
        UiAlert: (opts: UiAlertOptions) => {
          const o = { ui: "alert", ...(opts || {}) };
          emit(o);
          return tag(o);
        },
        UiBadge: (
          textOrOpts: string | ({ text: string } & UiBadgeOptions),
          opts?: UiBadgeOptions
        ) => {
          const o =
            textOrOpts && typeof textOrOpts === "object" && "text" in textOrOpts
              ? { ui: "badge", ...textOrOpts }
              : {
                  ui: "badge",
                  text: String(textOrOpts ?? ""),
                  ...(opts || {}),
                };
          emit(o);
          return tag(o);
        },
        UiMetric: (
          valueOrOpts:
            | string
            | number
            | ({ value: string | number } & UiMetricOptions),
          opts?: UiMetricOptions
        ) => {
          const o =
            valueOrOpts &&
            typeof valueOrOpts === "object" &&
            "value" in valueOrOpts
              ? { ui: "metric", ...valueOrOpts }
              : { ui: "metric", value: valueOrOpts, ...(opts || {}) };
          emit(o);
          return tag(o);
        },
        UiProgress: (
          valueOrOpts: number | (UiProgressOptions & { value?: number }),
          opts?: UiProgressOptions
        ) => {
          const o =
            valueOrOpts && typeof valueOrOpts === "object"
              ? { ui: "progress", ...valueOrOpts }
              : { ui: "progress", value: valueOrOpts, ...(opts || {}) };
          emit(o);
          return tag(o);
        },
        UiSpinner: (opts?: UiSpinnerOptions) => {
          const o = { ui: "spinner", ...(opts || {}) };
          emit(o);
          return tag(o);
        },
      } as unknown;
    }
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
    // Allow outbound networking modules but block server/bind APIs.
    if (specifier === "http" || specifier === "node:http") {
      const mod = base("node:http");
      return wrapHttpModule(mod);
    }
    if (specifier === "https" || specifier === "node:https") {
      const mod = base("node:https");
      return wrapHttpsModule(mod);
    }
    if (specifier === "http2" || specifier === "node:http2") {
      const mod = base("node:http2");
      return wrapHttp2Module(mod);
    }
    if (specifier === "net" || specifier === "node:net") {
      const mod = base("node:net");
      return wrapNetModule(mod);
    }
    if (specifier === "tls" || specifier === "node:tls") {
      const mod = base("node:tls");
      return wrapTlsModule(mod);
    }
    if (specifier === "dgram" || specifier === "node:dgram") {
      const mod = base("node:dgram");
      return wrapDgramModule(mod);
    }
    return base(specifier);
  }) as unknown as NodeJS.Require & {
    setUiDisplayHook?: (fn: UiDisplayHook) => void;
  };

  const resolveFn = ((request: string, options?: unknown) => {
    return base.resolve(request, options as never);
  }) as NodeJS.Require["resolve"];
  if (base.resolve.paths) {
    resolveFn.paths = base.resolve.paths.bind(base.resolve);
  }

  sandboxRequire.resolve = resolveFn as NodeJS.Require["resolve"];
  sandboxRequire.cache = base.cache;
  sandboxRequire.main = base.main;
  sandboxRequire.extensions = base.extensions;
  // Allow runtime to set the UI hook for streaming
  (
    sandboxRequire as unknown as {
      setUiDisplayHook: (fn: UiDisplayHook) => void;
    }
  ).setUiDisplayHook = (fn: UiDisplayHook) => {
    uiDisplayHook = fn ?? null;
  };
  return sandboxRequire as NodeJS.Require & {
    setUiDisplayHook: (fn: UiDisplayHook) => void;
  };
};

// --- Network module wrappers: allow client connections, block server/bind. ---
const bindCallable = (val: unknown, thisArg: unknown): unknown => {
  if (typeof val === "function") {
    // Use Reflect.apply to avoid relying on the Function type
    return (...args: unknown[]) =>
      Reflect.apply(val as never, thisArg as never, args as never);
  }
  return val as unknown;
};

const wrapHttpModule = (mod: Record<string, unknown>) => {
  const blocked = () => {
    throw new Error("http server creation is not allowed in NodeBooks runtime");
  };
  const proxy: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(mod) as string[]) {
    const val = (mod as Record<string, unknown>)[key];
    if (key === "createServer") {
      proxy[key] = blocked;
    } else {
      proxy[key] = bindCallable(val, mod);
    }
  }
  return proxy;
};

const wrapHttpsModule = (mod: Record<string, unknown>) => {
  const blocked = () => {
    throw new Error(
      "https server creation is not allowed in NodeBooks runtime"
    );
  };
  const proxy: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(mod) as string[]) {
    const val = (mod as Record<string, unknown>)[key];
    if (key === "createServer") {
      proxy[key] = blocked;
    } else {
      proxy[key] = bindCallable(val, mod);
    }
  }
  return proxy;
};

const wrapHttp2Module = (mod: Record<string, unknown>) => {
  const blocked = () => {
    throw new Error(
      "http2 server creation is not allowed in NodeBooks runtime"
    );
  };
  const proxy: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(mod) as string[]) {
    const val = (mod as Record<string, unknown>)[key];
    if (key === "createServer" || key === "createSecureServer") {
      proxy[key] = blocked;
    } else {
      proxy[key] = bindCallable(val, mod);
    }
  }
  return proxy;
};

const wrapNetModule = (mod: Record<string, unknown>) => {
  const blocked = () => {
    throw new Error("net server creation is not allowed in NodeBooks runtime");
  };
  const proxy: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(mod) as string[]) {
    const val = (mod as Record<string, unknown>)[key];
    if (key === "createServer") {
      proxy[key] = blocked;
    } else if (key === "Server") {
      // Expose the constructor but warn on listen will be best-effort elsewhere
      proxy[key] = val as unknown;
    } else {
      proxy[key] = bindCallable(val, mod);
    }
  }
  return proxy;
};

const wrapTlsModule = (mod: Record<string, unknown>) => {
  const blocked = () => {
    throw new Error("tls server creation is not allowed in NodeBooks runtime");
  };
  const proxy: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(mod) as string[]) {
    const val = (mod as Record<string, unknown>)[key];
    if (key === "createServer") {
      proxy[key] = blocked;
    } else {
      proxy[key] = bindCallable(val, mod);
    }
  }
  return proxy;
};

const wrapDgramModule = (mod: Record<string, unknown>) => {
  const proxy: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(mod) as string[]) {
    const val = (mod as Record<string, unknown>)[key];
    if (key === "createSocket" && typeof val === "function") {
      proxy[key as string] = (...args: unknown[]) => {
        const socket = Reflect.apply(val as never, mod as never, args as never);
        // Wrap bind/addMembership
        const sProxy = new Proxy(socket as object, {
          get(target: object, prop: string | symbol, receiver: unknown) {
            if (
              prop === "bind" ||
              prop === "addMembership" ||
              prop === "setMulticastTTL" ||
              prop === "addSourceSpecificMembership"
            ) {
              return () => {
                throw new Error(
                  "dgram binding/multicast is not allowed in NodeBooks runtime"
                );
              };
            }
            const v = Reflect.get(target, prop, receiver);
            if (typeof v === "function") {
              return (...fnArgs: unknown[]) =>
                Reflect.apply(v as never, target as never, fnArgs as never);
            }
            return v;
          },
        });
        return sProxy;
      };
    } else {
      proxy[key as string] = bindCallable(val, mod);
    }
  }
  return proxy;
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
