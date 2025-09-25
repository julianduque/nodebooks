import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { fork, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { IpcEventMessageSchema } from "@nodebooks/runtime-protocol";
import type { IpcEventMessage, IpcRunCell } from "@nodebooks/runtime-protocol";
import { tryDecode, StreamKind } from "@nodebooks/runtime-protocol";
import { createCodeCell, NotebookEnvSchema } from "@nodebooks/notebook-schema";

const req = createRequire(import.meta.url);

const spawnWorker = (): ChildProcess => {
  const dist = req.resolve("@nodebooks/runtime-node-worker/dist/worker.js");
  const child = fork(dist, {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    serialization: "advanced",
    env: { ...process.env, NODEBOOKS_BATCH_MS: "5" },
  });
  return child;
};

describe("runtime-node-worker", () => {
  let child: ChildProcess;
  beforeEach(() => {
    child = spawnWorker();
  });
  afterEach(async () => {
    try {
      child.kill();
    } catch {
      /* noop */
    }
  });

  it("responds to Ping with Pong", async () => {
    const p = new Promise<void>((resolve, _reject) => {
      const onMsg = (raw: unknown) => {
        const parsed = IpcEventMessageSchema.safeParse(raw);
        if (parsed.success && parsed.data.type === "Pong") {
          child.off("message", onMsg);
          resolve();
        }
      };
      child.on("message", onMsg);
    });
    child.send({ type: "Ping" });
    await p;
  });

  it("runs a cell and streams stdout", async () => {
    const cell = createCodeCell({ language: "js", source: "" });
    const env = NotebookEnvSchema.parse({
      runtime: "node",
      packages: {},
      variables: {},
    });
    const payload: IpcRunCell = {
      type: "RunCell",
      jobId: "t1",
      cell,
      code: "console.log('hello from worker'); 'done'",
      notebookId: "nbw",
      env,
      timeoutMs: 2000,
    };

    let sawStdout = false;
    type ResultMsg = Extract<IpcEventMessage, { type: "Result" }>;
    const done = new Promise<ResultMsg>((resolve) => {
      const onMsg = (raw: unknown) => {
        if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) {
          const arr = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
          const frame = tryDecode(arr);
          if (frame && frame.kind === StreamKind.Stdout) {
            const text = (frame as { text: string }).text;
            if (text.includes("hello")) {
              sawStdout = true;
            }
          }
          return;
        }
        const parsed = IpcEventMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const msg = parsed.data;
        if (msg.type === "Result") {
          child.off("message", onMsg);
          resolve(msg as ResultMsg);
        }
      };
      child.on("message", onMsg);
    });
    child.send(payload);
    const res = await done;
    expect(sawStdout).toBe(true);
    expect(res.execution.status).toBe("ok");
  });

  it("returns error status on timeout", async () => {
    const cell = createCodeCell({ language: "js", source: "" });
    const env = NotebookEnvSchema.parse({
      runtime: "node",
      packages: {},
      variables: {},
    });
    const payload: IpcRunCell = {
      type: "RunCell",
      jobId: "t2",
      cell,
      code: "await new Promise(res => setTimeout(res, 2000))",
      notebookId: "nbw",
      env,
      timeoutMs: 50,
    };
    type ResultMsg2 = Extract<IpcEventMessage, { type: "Result" }>;
    const res = await new Promise<ResultMsg2>((resolve) => {
      const onMsg = (raw: unknown) => {
        const parsed = IpcEventMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const msg = parsed.data;
        if (msg.type === "Result") {
          child.off("message", onMsg);
          resolve(msg as ResultMsg2);
        }
      };
      child.on("message", onMsg);
      child.send(payload);
    });
    expect(res.type).toBe("Result");
    if (res.type === "Result") {
      expect(res.execution.status).toBe("error");
    }
  });
});
