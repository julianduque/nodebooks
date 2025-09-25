import type {
  DisplayDataOutput,
  NotebookEnv,
  StreamOutput,
  OutputExecution,
  CodeCell,
} from "@nodebooks/notebook-schema";
import type { WorkerPool } from "./pool.js";

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
  outputs: Array<
    | StreamOutput
    | DisplayDataOutput
    | { type: "error"; ename: string; evalue: string; traceback: string[] }
  >;
  execution: OutputExecution;
}

export class WorkerClient {
  private currentJobId: string | null = null;
  constructor(private readonly pool: WorkerPool) {}

  async execute(opts: ExecuteOptions): Promise<ExecuteResult> {
    const jobId = `${opts.notebookId}:${opts.cell.id}:${Date.now()}`;
    this.currentJobId = jobId;
    try {
      const res = await this.pool.run(jobId, {
        cell: opts.cell,
        code: opts.code,
        notebookId: opts.notebookId,
        env: opts.env,
        timeoutMs: opts.timeoutMs,
        onStdout: (text) =>
          opts.onStream?.({ type: "stream", name: "stdout", text }),
        onStderr: (text) =>
          opts.onStream?.({ type: "stream", name: "stderr", text }),
        onDisplay: (obj) => {
          try {
            const d = obj as DisplayDataOutput;
            if (d && d.type === "display_data") {
              opts.onDisplay?.(d);
            }
          } catch {
            /* noop */
          }
        },
      });
      return res as ExecuteResult;
    } finally {
      if (this.currentJobId === jobId) this.currentJobId = null;
    }
  }

  cancel() {
    const id = this.currentJobId;
    if (id) this.pool.cancel(id);
  }
}
