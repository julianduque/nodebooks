import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WorkerPool } from "../src/pool.js";
import { createCodeCell, NotebookEnvSchema } from "@nodebooks/notebook-schema";

const makeEnv = () =>
  NotebookEnvSchema.parse({ runtime: "node", packages: {}, variables: {} });

describe("WorkerPool", () => {
  let pool: WorkerPool;
  beforeAll(() => {
    pool = new WorkerPool({
      size: 1,
      perJobTimeoutMs: 2000,
      memoryMb: 256,
      batchMs: 10,
      maxOutputBytes: 1_000_000,
      cancelGraceMs: 100,
    });
  });
  afterAll(() => {
    // No explicit teardown; child processes exit with test runner
  });

  it("runs a job and streams stdout + display (happy path)", async () => {
    const env = makeEnv();
    const cell = createCodeCell({ language: "js", source: "" });
    let stdout = "";
    const displays: unknown[] = [];
    const code = `
      const { UiMarkdown } = require('@nodebooks/ui');
      console.log('hello');
      UiMarkdown('ok');
      'done';
    `;
    const res = await pool.run("job-happy", {
      cell,
      code,
      notebookId: "nb1",
      env,
      onStdout: (t) => (stdout += t),
      onDisplay: (o) => displays.push(o),
    });
    expect(stdout).toMatch(/hello/);
    expect(displays.length).toBeGreaterThan(0);
    expect(res.execution.status).toBe("ok");
  }, 15000);

  it("times out long-running code", async () => {
    const env = makeEnv();
    const cell = createCodeCell({ language: "js", source: "" });
    const code = `await new Promise(res => setTimeout(res, 2000));`;
    const res = await pool.run("job-timeout", {
      cell,
      code,
      notebookId: "nb2",
      env,
      timeoutMs: 50,
    });
    expect(res.execution.status).toBe("error");
  }, 15000);

  it("cancels a running job", async () => {
    const env = makeEnv();
    const cell = createCodeCell({ language: "js", source: "" });
    const code = `while (true) {}`; // busy loop
    const p = pool.run("job-cancel", {
      cell,
      code,
      notebookId: "nb3",
      env,
      timeoutMs: 10_000,
    });
    // give it a moment to start
    await new Promise((r) => setTimeout(r, 50));
    pool.cancel("job-cancel");
    await expect(async () => {
      await p;
    }).rejects.toThrow();
  }, 15000);
});
