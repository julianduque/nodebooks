import { fork, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import type { IpcEventMessage, IpcRunCell } from "@nodebooks/runtime-protocol";
import { IpcEventMessageSchema } from "@nodebooks/runtime-protocol";
import type { CodeCell, NotebookEnv } from "@nodebooks/notebook-schema";
import { tryDecode, StreamKind } from "@nodebooks/runtime-protocol";
import type { DisplayDataOutput } from "@nodebooks/notebook-schema";

export interface ExecuteOptions {
  cell: CodeCell;
  code: string;
  notebookId: string;
  env: NotebookEnv;
  globals?: Record<string, unknown>;
  timeoutMs?: number;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
  onDisplay?: (obj: unknown) => void;
}

export interface InvokeHandlerOptions {
  handlerId: string;
  notebookId: string;
  env: NotebookEnv;
  event: string;
  payload?: unknown;
  componentId?: string;
  cellId?: string;
  globals?: Record<string, unknown>;
  timeoutMs?: number;
  onStdout?: (text: string) => void;
  onStderr?: (text: string) => void;
  onDisplay?: (obj: unknown) => void;
}

type WorkerJobOptions =
  | ({ kind: "execute" } & ExecuteOptions)
  | ({ kind: "invoke" } & InvokeHandlerOptions);

export interface ExecuteResult {
  outputs: unknown[];
  execution: {
    started: number;
    ended: number;
    status: "ok" | "error" | "aborted";
    error?: { name: string; message: string; stack?: string };
  };
}

export interface WorkerPoolOptions {
  size?: number;
  memoryMb?: number; // passed via --max-old-space-size
  perJobTimeoutMs?: number; // default if job doesn't specify
  maxOutputBytes?: number; // cap for combined stdout/stderr/display frames
  batchMs?: number; // forwarded to worker via env NODEBOOKS_BATCH_MS
  cancelGraceMs?: number; // time from Cancel to kill
}

class WorkerHandle {
  readonly child: ChildProcess;
  busy = false;
  crashed = false;

  constructor(child: ChildProcess) {
    this.child = child;
    child.on("exit", () => {
      this.crashed = true;
    });
  }
}

type ActiveEntry = {
  worker: WorkerHandle;
  resolve: (r: ExecuteResult) => void;
  reject: (e: unknown) => void;
  bytes: number;
  cancelTimer?: NodeJS.Timeout;
};

export class WorkerPool {
  private readonly size: number;
  private readonly opts: Required<WorkerPoolOptions>;
  private readonly workers: WorkerHandle[] = [];
  private readonly queue: Array<() => void> = [];
  private readonly active = new Map<string, ActiveEntry>();

  constructor(
    sizeOrOpts: number | WorkerPoolOptions = Math.max(
      1,
      Math.min(2, os.cpus().length)
    )
  ) {
    const defaults: Required<WorkerPoolOptions> = {
      size: Math.max(1, Math.min(2, os.cpus().length)),
      memoryMb: 256,
      perJobTimeoutMs: 10_000,
      maxOutputBytes: 5_000_000,
      batchMs: 25,
      cancelGraceMs: 250,
    };
    const cfg =
      typeof sizeOrOpts === "number"
        ? { ...defaults, size: sizeOrOpts }
        : { ...defaults, ...sizeOrOpts };
    this.size = cfg.size;
    this.opts = cfg;
    for (let i = 0; i < this.size; i++) {
      this.workers.push(new WorkerHandle(spawnWorker(this.opts)));
    }
  }

  setPerJobTimeoutMs(timeoutMs: number) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return;
    this.opts.perJobTimeoutMs = timeoutMs;
  }

  async run(
    jobId: string,
    opts: WorkerJobOptions | ExecuteOptions
  ): Promise<ExecuteResult> {
    const job = this.normalizeJobOptions(opts);
    const worker = await this.acquire();
    try {
      return await this.runOnWorker(worker, jobId, job);
    } finally {
      this.release(worker);
    }
  }

  cancel(jobId: string) {
    const entry = this.active.get(jobId);
    if (!entry) return;
    try {
      entry.worker.child.send({ type: "Cancel", jobId });
    } catch {
      /* noop */
    }
    const timer = setTimeout(() => {
      try {
        entry.worker.child.kill("SIGKILL");
      } catch {
        /* noop */
      }
      entry.reject(new Error("Job cancelled"));
    }, this.opts.cancelGraceMs);
    // If the job finishes before grace, clear timer in message handler
    entry.cancelTimer = timer;
  }

  private normalizeJobOptions(
    opts: WorkerJobOptions | ExecuteOptions
  ): WorkerJobOptions {
    if ("kind" in opts) {
      if (opts.kind === "invoke") {
        return opts as WorkerJobOptions;
      }
      return { ...(opts as ExecuteOptions), kind: "execute" };
    }
    return { ...(opts as ExecuteOptions), kind: "execute" };
  }

  private async runOnWorker(
    worker: WorkerHandle,
    jobId: string,
    opts: WorkerJobOptions
  ): Promise<ExecuteResult> {
    const started = Date.now();
    const child = worker.child;
    const result = new Promise<ExecuteResult>((resolve, reject) => {
      const onMessage = (raw: unknown) => {
        if (raw && typeof raw === "object" && raw !== null) {
          if ("kind" in raw && (raw as { kind?: unknown }).kind === "display") {
            const payload = raw as { data?: unknown };
            if (payload.data) {
              opts.onDisplay?.(payload.data as DisplayDataOutput);
            }
            return;
          }
        }
        if (raw && typeof raw === "object" && raw !== null && "type" in raw) {
          const parsed = IpcEventMessageSchema.safeParse(raw);
          if (!parsed.success) return;
          const msg = parsed.data as IpcEventMessage;
          switch (msg.type) {
            case "Error":
              cleanup();
              reject(new Error(msg.message));
              break;
            case "Result":
              cleanup();
              resolve({ outputs: msg.outputs, execution: msg.execution });
              break;
          }
          return;
        }
        if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) {
          const arr = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
          const frame = tryDecode(arr);
          if (!frame) return;
          // Output cap
          const entry = this.active.get(jobId);
          if (entry) {
            entry.bytes += arr.byteLength;
            if (entry.bytes > this.opts.maxOutputBytes) {
              cleanup();
              try {
                child.kill("SIGKILL");
              } catch {
                /* noop */
              }
              reject(new Error("Output limit exceeded"));
              return;
            }
          }
          if (frame.kind === StreamKind.Display) {
            opts.onDisplay?.((frame as { data: unknown }).data);
          } else if (frame.kind === StreamKind.Stdout) {
            opts.onStdout?.((frame as { text: string }).text);
          } else if (frame.kind === StreamKind.Stderr) {
            opts.onStderr?.((frame as { text: string }).text);
          }
        }
      };

      const cleanup = () => {
        child.off("message", onMessage);
        const entry = this.active.get(jobId);
        if (entry?.cancelTimer) clearTimeout(entry.cancelTimer);
        this.active.delete(jobId);
      };

      child.on("message", onMessage);

      // Track active job
      this.active.set(jobId, { worker, resolve, reject, bytes: 0 });
      const timeout = opts.timeoutMs ?? this.opts.perJobTimeoutMs;
      if (opts.kind === "execute") {
        const payload: IpcRunCell = {
          type: "RunCell",
          jobId,
          cell: opts.cell,
          code: opts.code,
          notebookId: opts.notebookId,
          env: opts.env,
          timeoutMs: timeout,
          globals: opts.globals,
        };
        child.send(payload);
      } else {
        child.send({
          type: "InvokeHandler",
          jobId,
          handlerId: opts.handlerId,
          notebookId: opts.notebookId,
          env: opts.env,
          event: opts.event,
          payload: opts.payload,
          componentId: opts.componentId,
          cellId: opts.cellId,
          timeoutMs: timeout,
          globals: opts.globals,
        });
      }
    });

    return await result.finally(() => {
      const ended = Date.now();
      void started;
      void ended;
    });
  }

  private async acquire(): Promise<WorkerHandle> {
    const idle = this.workers.find((w) => !w.busy && !w.crashed);
    if (idle) {
      idle.busy = true;
      return idle;
    }
    return await new Promise<WorkerHandle>((resolve) => {
      this.queue.push(() => {
        const next = this.workers.find((w) => !w.busy && !w.crashed)!;
        next.busy = true;
        resolve(next);
      });
    });
  }

  private release(worker: WorkerHandle) {
    worker.busy = false;
    if (worker.crashed) {
      const idx = this.workers.indexOf(worker);
      if (idx >= 0) {
        this.workers[idx] = new WorkerHandle(spawnWorker(this.opts));
      }
    }
    const next = this.queue.shift();
    if (next) next();
  }

  // Reserve a dedicated worker for sticky-session execution. The returned API
  // allows running jobs on the same child process and releasing it when done.
  reserve() {
    // Spawn a dedicated child not shared with the pool for sticky sessions.
    let child = spawnWorker(this.opts);
    let runningJobId: string | null = null;
    let cancelTimer: NodeJS.Timeout | null = null;
    let rejectCurrent: ((e: unknown) => void) | null = null;
    let released = false;
    const runOnChild = (
      jobId: string,
      opts: WorkerJobOptions | ExecuteOptions
    ): Promise<ExecuteResult> => {
      runningJobId = jobId;
      return new Promise<ExecuteResult>((resolve, reject) => {
        const job = this.normalizeJobOptions(opts);
        rejectCurrent = reject;
        let bytes = 0;
        const onMessage = (raw: unknown) => {
          if (raw && typeof raw === "object" && raw !== null) {
            if (
              "kind" in raw &&
              (raw as { kind?: unknown }).kind === "display"
            ) {
              const payload = raw as { data?: unknown };
              if (payload.data) {
                job.onDisplay?.(payload.data as DisplayDataOutput);
              }
              return;
            }
          }
          if (raw && typeof raw === "object" && raw !== null && "type" in raw) {
            const parsed = IpcEventMessageSchema.safeParse(raw);
            if (!parsed.success) return;
            const msg = parsed.data as IpcEventMessage;
            if (msg.type === "Error") {
              cleanup();
              reject(new Error(msg.message));
              return;
            }
            if (msg.type === "Result") {
              cleanup();
              resolve({ outputs: msg.outputs, execution: msg.execution });
              return;
            }
            return;
          }
          if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) {
            const arr = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
            bytes += arr.byteLength;
            if (bytes > this.opts.maxOutputBytes) {
              cleanup();
              try {
                child.kill("SIGKILL");
              } catch (err) {
                void err;
              }
              reject(new Error("Output limit exceeded"));
              return;
            }
            const frame = tryDecode(arr);
            if (!frame) return;
            if (frame.kind === StreamKind.Display) {
              job.onDisplay?.((frame as { data: unknown }).data);
            } else if (frame.kind === StreamKind.Stdout) {
              job.onStdout?.((frame as { text: string }).text);
            } else if (frame.kind === StreamKind.Stderr) {
              job.onStderr?.((frame as { text: string }).text);
            }
          }
        };
        const cleanup = () => {
          child.off("message", onMessage);
          runningJobId = null;
          rejectCurrent = null;
          if (cancelTimer) {
            clearTimeout(cancelTimer);
            cancelTimer = null;
          }
        };
        child.on("message", onMessage);
        const timeout = job.timeoutMs ?? this.opts.perJobTimeoutMs;
        if (job.kind === "execute") {
          const payload: IpcRunCell = {
            type: "RunCell",
            jobId,
            cell: job.cell,
            code: job.code,
            notebookId: job.notebookId,
            env: job.env,
            timeoutMs: timeout,
            globals: job.globals,
          };
          child.send(payload);
        } else {
          child.send({
            type: "InvokeHandler",
            jobId,
            handlerId: job.handlerId,
            notebookId: job.notebookId,
            env: job.env,
            event: job.event,
            payload: job.payload,
            componentId: job.componentId,
            cellId: job.cellId,
            timeoutMs: timeout,
            globals: job.globals,
          });
        }
      });
    };

    const cancel = (jobId: string) => {
      try {
        child.send({ type: "Cancel", jobId });
      } catch (err) {
        void err;
      }
      // If the job doesn't finish within grace, force kill and respawn.
      if (cancelTimer) {
        clearTimeout(cancelTimer);
        cancelTimer = null;
      }
      cancelTimer = setTimeout(() => {
        if (runningJobId === jobId) {
          try {
            child.kill("SIGKILL");
          } catch (err) {
            void err;
          }
          // Reject the in-flight promise to unblock callers
          try {
            rejectCurrent?.(new Error("Job cancelled"));
          } catch (err) {
            void err;
          }
          // respawn a fresh child for subsequent runs
          child = spawnWorker(this.opts);
          runningJobId = null;
          rejectCurrent = null;
        }
      }, this.opts.cancelGraceMs);
    };

    const release = () => {
      if (released) return;
      released = true;
      try {
        child.kill();
      } catch (err) {
        void err;
      }
    };

    return { run: runOnChild, cancel, release };
  }
}

const spawnWorker = (opts: Required<WorkerPoolOptions>): ChildProcess => {
  const req = createRequire(import.meta.url);
  type FsLike = { existsSync: (p: string) => boolean };
  const fsMod = req("node:fs") as FsLike;

  const tryResolve = (id: string): string | null => {
    try {
      return req.resolve(id);
    } catch {
      return null;
    }
  };

  const pkgRoot = (() => {
    const pkgJson = tryResolve("@nodebooks/runtime-node-worker/package.json");
    return pkgJson ? pkgJson.replace(/\/package\.json$/, "") : null;
  })();

  // Prefer built worker
  let distPath = tryResolve("@nodebooks/runtime-node-worker/dist/worker.js");
  if ((!distPath || !fsMod.existsSync(distPath)) && pkgRoot) {
    const candidate = `${pkgRoot}dist/worker.js`;
    if (fsMod.existsSync(candidate)) distPath = candidate;
  }
  // Workspace-relative fallback (useful in monorepo dev when deps weren't re-installed)
  if (!distPath || !fsMod.existsSync(distPath)) {
    try {
      const here = fileURLToPath(import.meta.url);
      const base = dirname(here);
      const candidate = join(
        base,
        "..",
        "..",
        "runtime-node-worker",
        "dist",
        "worker.js"
      );
      if (fsMod.existsSync(candidate)) distPath = candidate;
    } catch {
      /* noop */
    }
  }

  // Fallback to TS source only if present; otherwise, provide a friendly error
  let srcPath = tryResolve("@nodebooks/runtime-node-worker/src/worker.ts");
  if ((!srcPath || !fsMod.existsSync(srcPath)) && pkgRoot) {
    const candidate = `${pkgRoot}src/worker.ts`;
    if (fsMod.existsSync(candidate)) srcPath = candidate;
  }
  if (!srcPath || !fsMod.existsSync(srcPath)) {
    try {
      const here = fileURLToPath(import.meta.url);
      const base = dirname(here);
      const candidate = join(
        base,
        "..",
        "..",
        "runtime-node-worker",
        "src",
        "worker.ts"
      );
      if (fsMod.existsSync(candidate)) srcPath = candidate;
    } catch {
      /* noop */
    }
  }

  const useDist = !!distPath && fsMod.existsSync(distPath);
  const usingSrc = !useDist && !!srcPath && fsMod.existsSync(srcPath);
  if (!useDist && !usingSrc) {
    throw new Error(
      "Cannot locate @nodebooks/runtime-node-worker entry. Ensure the package is installed and built (pnpm -w -r build)."
    );
  }

  let execArgv: string[];
  let entry = distPath as string;
  if (usingSrc) {
    entry = srcPath as string;
    const loader = (() => {
      const m = tryResolve("tsx/dist/loader.mjs") || tryResolve("tsx");
      if (!m) {
        throw new Error(
          "tsx is not available to load TypeScript worker. Build the worker (pnpm -w -r build) so dist/worker.js exists."
        );
      }
      return m;
    })();
    execArgv = ["--loader", loader, `--max-old-space-size=${opts.memoryMb}`];
  } else {
    execArgv = [`--max-old-space-size=${opts.memoryMb}`];
  }

  const child = fork(entry, {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    serialization: "advanced",
    execArgv,
    env: { ...process.env, NODEBOOKS_BATCH_MS: String(opts.batchMs) },
  });
  return child;
};
