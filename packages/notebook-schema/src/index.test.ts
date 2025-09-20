import { describe, expect, it } from "vitest";
import {
  KernelExecuteRequestSchema,
  KernelServerMessageSchema,
  createCodeCell,
  createEmptyNotebook,
  createMarkdownCell,
} from "./index.js";

describe("notebook schema", () => {
  it("creates notebooks with sensible defaults", () => {
    const notebook = createEmptyNotebook();
    expect(notebook.name).toBe("Untitled Notebook");
    expect(Array.isArray(notebook.cells)).toBe(true);
  });

  it("constructs cells with unique identifiers", () => {
    const code = createCodeCell({ source: "console.log('hello');" });
    const markdown = createMarkdownCell({ source: "# Title" });
    expect(code.id).not.toEqual(markdown.id);
    expect(code.type).toBe("code");
    expect(markdown.type).toBe("markdown");
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
