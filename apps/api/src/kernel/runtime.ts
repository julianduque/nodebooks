import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { formatWithOptions, inspect } from "node:util";
import vm from "node:vm";
import { transform } from "esbuild";
import type {
  CodeCell,
  NotebookOutput,
  StreamOutput,
  OutputExecution,
} from "@nodebooks/notebook-schema";

const DEFAULT_TIMEOUT_MS = 10_000;

interface ExecuteOptions {
  cell: CodeCell;
  code: string;
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

  constructor() {
    const require = createRequire(import.meta.url);
    const sandbox: Record<string, unknown> = {
      console: this.console.proxy,
      require,
      module: { exports: {} },
      exports: {},
      process,
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
      const compiled = await transform(code, {
        loader: cell.language === "ts" ? "ts" : "js",
        format: "cjs",
        target: "es2022",
        sourcemap: false,
      });

      const filename = join("/notebooks", `${cell.id}.${cell.language}`);
      const module = { exports: {} };
      (this.context as Record<string, unknown>).module = module;
      (this.context as Record<string, unknown>).exports = module.exports;
      (this.context as Record<string, unknown>).__filename = filename;
      (this.context as Record<string, unknown>).__dirname = dirname(filename);

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
}

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
