import { describe, expect, it } from "vitest";
import {
  KernelExecuteRequestSchema,
  KernelServerMessageSchema,
  createCodeCell,
  createEmptyNotebook,
  createMarkdownCell,
  createShellCell,
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
    const shell = createShellCell({ source: "ls" });
    expect(code.id).not.toEqual(markdown.id);
    expect(shell.id).not.toEqual(code.id);
    expect(code.type).toBe("code");
    expect(markdown.type).toBe("markdown");
    expect(shell.type).toBe("shell");
  });

  it("validates kernel protocol messages", () => {
    const request = KernelExecuteRequestSchema.parse({
      type: "execute_request",
      cellType: "code",
      cellId: "cell-1",
      code: "1 + 2",
      language: "js",
    });
    expect(request.language).toBe("js");

    const shellRequest = KernelExecuteRequestSchema.parse({
      type: "execute_request",
      cellType: "shell",
      cellId: "cell-2",
      command: "ls",
    });
    expect(shellRequest.cellType).toBe("shell");

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
