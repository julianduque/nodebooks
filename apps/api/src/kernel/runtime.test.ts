import { describe, expect, it } from "vitest";
import { createCodeCell } from "@nodebooks/notebook-schema";
import { NotebookRuntime } from "./runtime.js";

describe("NotebookRuntime", () => {
  it("executes JavaScript and captures console output", async () => {
    const runtime = new NotebookRuntime();
    const cell = createCodeCell({ id: "cell-js", language: "js" });
    const streams: string[] = [];

    const result = await runtime.execute({
      cell,
      code: "console.log('hello runtime'); 2 + 3;",
      onStream: (output) => {
        streams.push(output.text.trim());
      },
    });

    expect(result.execution.status).toBe("ok");
    expect(streams.some((line) => line.includes("hello runtime"))).toBe(true);
    expect(result.outputs.some((output) => output.type === "display_data")).toBe(true);
  });

  it("transpiles TypeScript before execution", async () => {
    const runtime = new NotebookRuntime();
    const cell = createCodeCell({ id: "cell-ts", language: "ts" });

    const result = await runtime.execute({
      cell,
      code: "const add = (a: number, b: number): number => a + b; add(1, 2);",
    });

    expect(result.execution.status).toBe("ok");
    expect(result.outputs.some((output) => output.type === "display_data")).toBe(true);
  });

  it("reports execution errors", async () => {
    const runtime = new NotebookRuntime();
    const cell = createCodeCell({ id: "cell-error", language: "js" });

    const result = await runtime.execute({
      cell,
      code: "throw new Error('boom');",
    });

    expect(result.execution.status).toBe("error");
    const last = result.outputs[result.outputs.length - 1];
    expect(last?.type).toBe("error");
  });
});
