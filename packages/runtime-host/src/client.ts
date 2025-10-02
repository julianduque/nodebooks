import type {
  DisplayDataOutput,
  NotebookEnv,
  StreamOutput,
  OutputExecution,
  CodeCell,
  ShellCell,
} from "@nodebooks/notebook-schema";
import type { WorkerPool } from "./pool.js";

type CommonExecuteOptions = {
  notebookId: string;
  env: NotebookEnv;
  onStream?: (output: StreamOutput) => void;
  onDisplay?: (output: DisplayDataOutput) => void;
  timeoutMs?: number;
};

export type ExecuteOptions =
  | (CommonExecuteOptions & { cell: CodeCell; code: string })
  | (CommonExecuteOptions & { cell: ShellCell; command: string });

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
  private reserved: ReturnType<WorkerPool["reserve"]> | null = null;
  constructor(private readonly pool: WorkerPool) {}

  async execute(opts: ExecuteOptions): Promise<ExecuteResult> {
    const jobId = `${opts.notebookId}:${opts.cell.id}:${Date.now()}`;
    this.currentJobId = jobId;
    try {
      if (!this.reserved) {
        this.reserved = this.pool.reserve();
      }
      const runOptions =
        opts.cell.type === "shell"
          ? {
              cell: opts.cell,
              command: opts.command,
            }
          : {
              cell: opts.cell,
              code: opts.code,
            };

      const res = await this.reserved.run(jobId, {
        ...runOptions,
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
            if (
              d &&
              (d.type === "display_data" ||
                d.type === "update_display_data" ||
                d.type === "execute_result")
            ) {
              opts.onDisplay?.(d);
            }
          } catch (err) {
            void err;
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
    if (id) {
      if (this.reserved) this.reserved.cancel(id);
      else this.pool.cancel(id);
    }
  }

  release() {
    try {
      this.reserved?.release();
    } catch (err) {
      void err;
    }
    this.reserved = null;
  }
}
