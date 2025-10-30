import { describe, expect, it } from "vitest";
import {
  KernelExecuteRequestSchema,
  KernelServerMessageSchema,
  createCodeCell,
  createEmptyNotebook,
  createMarkdownCell,
  createTerminalCell,
  createCommandCell,
  createHttpCell,
  createSqlCell,
  createPlotCell,
  createAiCell,
  createPlotCell,
} from "../src/index.js";

describe("notebook schema", () => {
  it("creates notebooks with sensible defaults", () => {
    const notebook = createEmptyNotebook();
    expect(notebook.name).toBe("Untitled Notebook");
    expect(Array.isArray(notebook.cells)).toBe(true);
  });

  it("constructs cells with unique identifiers", () => {
    const code = createCodeCell({ source: "console.log('hello');" });
    const markdown = createMarkdownCell({ source: "# Title" });
    const terminal = createTerminalCell();
    const command = createCommandCell({ command: "echo 'hi'" });
    const http = createHttpCell();
    const sql = createSqlCell({ query: "select 1" });
    const plot = createPlotCell({ chartType: "bar" });
    const ai = createAiCell({ prompt: "Hello" });
    const plot = createPlotCell({ chartType: "bar" });
    expect(code.id).not.toEqual(markdown.id);
    expect(code.type).toBe("code");
    expect(markdown.type).toBe("markdown");
    expect(terminal.type).toBe("terminal");
    expect(terminal.buffer).toBe("");
    expect(command.type).toBe("command");
    expect(command.command).toBe("echo 'hi'");
    expect(http.type).toBe("http");
    expect(http.request.method).toBe("GET");
    expect(sql.type).toBe("sql");
    expect(sql.query).toBe("select 1");
    expect(plot.type).toBe("plot");
    expect(plot.chartType).toBe("bar");
    expect(Array.isArray(plot.bindings.traces)).toBe(true);
    expect(ai.type).toBe("ai");
    expect(ai.prompt).toBe("Hello");
    expect(plot.type).toBe("plot");
    expect(plot.chartType).toBe("bar");
    expect(Array.isArray(plot.bindings.traces)).toBe(true);
  });

  it("validates kernel protocol messages", () => {
    const request = KernelExecuteRequestSchema.parse({
      type: "execute_request",
      cellId: "cell-1",
      code: "1 + 2",
      language: "js",
    });
    expect(request.language).toBe("js");

    const message = KernelServerMessageSchema.parse({
      type: "stream",
      cellId: "cell-1",
      name: "stdout",
      text: "hello",
    });
    expect(message.type).toBe("stream");
    if (message.type === "stream") {
      expect(message.name).toBe("stdout");
    }
  });
});
