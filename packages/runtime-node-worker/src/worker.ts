import process from "node:process";
import { loadRuntimeConfig } from "@nodebooks/config";
import {
  IpcControlMessageSchema,
  IpcRunCellSchema,
  IpcInvokeHandlerSchema,
  IpcCancelSchema,
  IpcPingSchema,
  type IpcControlMessage,
  type IpcRunCell,
  type IpcInvokeHandler,
  type IpcCancel,
  packText,
  StreamKind,
} from "@nodebooks/runtime-protocol";
import { NotebookRuntime } from "@nodebooks/runtime-node";

type RunContext = { jobId: string; cancelled: boolean };

let current: RunContext | null = null;
const runtime = new NotebookRuntime();

const safeSend = (msg: unknown) => {
  try {
    if (typeof process.send === "function") {
      (process.send as (message: unknown) => void)(msg);
    }
  } catch {
    /* noop */
  }
};

const handleRun = async (payload: IpcRunCell) => {
  current = { jobId: payload.jobId, cancelled: false };
  safeSend({ type: "Ack", jobId: payload.jobId });
  const jobIdNum = hash32(payload.jobId);

  let stdoutBuf = "";
  let stderrBuf = "";
  let flushTimer: NodeJS.Timeout | null = null;
  const batchMs = loadRuntimeConfig().batchMs;
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      try {
        if (stdoutBuf) {
          const frame = packText(StreamKind.Stdout, jobIdNum, stdoutBuf);
          safeSend(frame);
          stdoutBuf = "";
        }
        if (stderrBuf) {
          const frame = packText(StreamKind.Stderr, jobIdNum, stderrBuf);
          safeSend(frame);
          stderrBuf = "";
        }
      } finally {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
      }
    }, batchMs);
  };

  try {
    const result = await runtime.execute({
      cell: payload.cell,
      code: payload.code,
      notebookId: payload.notebookId,
      env: payload.env,
      timeoutMs: payload.timeoutMs,
      globals: payload.globals,
      onStream: (stream) => {
        if (current?.cancelled) return;
        if (stream.name === "stdout") stdoutBuf += stream.text;
        else stderrBuf += stream.text;
        scheduleFlush();
      },
      onDisplay: (display) => {
        if (current?.cancelled) return;
        safeSend({
          kind: "display",
          jobId: jobIdNum,
          data: display,
        });
      },
    });
    if (stdoutBuf) {
      const frame = packText(StreamKind.Stdout, jobIdNum, stdoutBuf, true);
      safeSend(frame);
      stdoutBuf = "";
    }
    if (stderrBuf) {
      const frame = packText(StreamKind.Stderr, jobIdNum, stderrBuf, true);
      safeSend(frame);
      stderrBuf = "";
    }
    safeSend({
      type: "Result",
      jobId: payload.jobId,
      outputs: result.outputs,
      execution: result.execution,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    safeSend({
      type: "Error",
      jobId: payload.jobId,
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
  } finally {
    current = null;
  }
};

const handleInvoke = async (payload: IpcInvokeHandler) => {
  current = { jobId: payload.jobId, cancelled: false };
  safeSend({ type: "Ack", jobId: payload.jobId });
  const jobIdNum = hash32(payload.jobId);

  let stdoutBuf = "";
  let stderrBuf = "";
  let flushTimer: NodeJS.Timeout | null = null;
  const batchMs = loadRuntimeConfig().batchMs;
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      try {
        if (stdoutBuf) {
          const frame = packText(StreamKind.Stdout, jobIdNum, stdoutBuf);
          safeSend(frame);
          stdoutBuf = "";
        }
        if (stderrBuf) {
          const frame = packText(StreamKind.Stderr, jobIdNum, stderrBuf);
          safeSend(frame);
          stderrBuf = "";
        }
      } finally {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
      }
    }, batchMs);
  };

  try {
    const result = await runtime.invokeUiHandler({
      handlerId: payload.handlerId,
      notebookId: payload.notebookId,
      env: payload.env,
      event: payload.event,
      payload: payload.payload,
      componentId: payload.componentId,
      cellId: payload.cellId,
      timeoutMs: payload.timeoutMs,
      globals: payload.globals,
      onStream: (stream) => {
        if (current?.cancelled) return;
        if (stream.name === "stdout") stdoutBuf += stream.text;
        else stderrBuf += stream.text;
        scheduleFlush();
      },
      onDisplay: (display) => {
        if (current?.cancelled) return;
        safeSend({
          kind: "display",
          jobId: jobIdNum,
          data: display,
        });
      },
    });
    if (stdoutBuf) {
      const frame = packText(StreamKind.Stdout, jobIdNum, stdoutBuf, true);
      safeSend(frame);
      stdoutBuf = "";
    }
    if (stderrBuf) {
      const frame = packText(StreamKind.Stderr, jobIdNum, stderrBuf, true);
      safeSend(frame);
      stderrBuf = "";
    }
    safeSend({
      type: "Result",
      jobId: payload.jobId,
      outputs: result.outputs,
      execution: result.execution,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    safeSend({
      type: "Error",
      jobId: payload.jobId,
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
  } finally {
    current = null;
  }
};

const handleCancel = (_payload: IpcCancel) => {
  if (current) current.cancelled = true;
};

process.on("message", async (raw: unknown) => {
  const parsed = IpcControlMessageSchema.safeParse(raw);
  if (!parsed.success) return;
  const msg = parsed.data as IpcControlMessage;
  if (IpcRunCellSchema.safeParse(msg).success) {
    await handleRun(msg as unknown as IpcRunCell);
    return;
  }
  if (IpcInvokeHandlerSchema.safeParse(msg).success) {
    await handleInvoke(msg as unknown as IpcInvokeHandler);
    return;
  }
  if (IpcCancelSchema.safeParse(msg).success) {
    handleCancel(msg as unknown as IpcCancel);
    return;
  }
  if (IpcPingSchema.safeParse(msg).success) {
    safeSend({ type: "Pong" });
  }
});

const hash32 = (s: string) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
