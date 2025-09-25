import { describe, it, expect } from "vitest";
import {
  IpcRunCellSchema,
  IpcControlMessageSchema,
  IpcEventMessageSchema,
} from "../src/kernel-ipc";
import { createCodeCell, NotebookEnvSchema } from "@nodebooks/notebook-schema";

describe("kernelIpc schemas", () => {
  it("parses a valid RunCell control message", () => {
    const cell = createCodeCell({ language: "js", source: "1+1" });
    const env = NotebookEnvSchema.parse({
      runtime: "node",
      packages: {},
      variables: {},
    });
    const msg = {
      type: "RunCell",
      jobId: "job-1",
      cell,
      code: "1+1",
      notebookId: "nb-1",
      env,
      timeoutMs: 1234,
    };
    const parsed = IpcRunCellSchema.safeParse(msg);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid control message type", () => {
    const bad = { type: "Unknown", foo: 1 };
    const parsed = IpcControlMessageSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("parses a Result event message", () => {
    const evt = {
      type: "Result" as const,
      jobId: "j1",
      outputs: [],
      execution: {
        started: Date.now(),
        ended: Date.now(),
        status: "ok" as const,
      },
    };
    const parsed = IpcEventMessageSchema.safeParse(evt);
    expect(parsed.success).toBe(true);
  });
});
