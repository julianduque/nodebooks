import React, { act } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createRoot } from "react-dom/client";

import { ThemeProvider } from "@/components/theme-context";

const renderSpy = vi.fn<[string, string], Promise<{ svg: string }>>(
  (id, definition) =>
    Promise.resolve({ svg: `<svg data-id="${id}">${definition}</svg>` })
);

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: renderSpy,
  },
}));

vi.mock("dompurify", () => ({
  default: {
    sanitize: (value: string) => value,
    addHook: vi.fn(),
  },
}));

vi.mock("@/components/notebook/attachment-utils", () => ({
  useAttachmentDropzone: () => ({
    isDraggingOver: false,
    handleDragEnter: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
  }),
  useAttachmentUploader: () => ({
    uploadFiles: vi.fn(),
    isUploading: false,
    uploadStatus: null,
    uploadError: null,
  }),
}));

vi.mock("@/components/notebook/monaco-editor-client", () => ({
  default: () => null,
}));

vi.mock("@/components/notebook/monaco-setup", () => ({
  initMonaco: vi.fn(),
}));

import type { NotebookCell } from "@nodebooks/notebook-schema";
import MarkdownCellView from "@/components/notebook/markdown-cell-view";

const noop = () => undefined;

describe("MarkdownCellView", () => {
  let container: HTMLDivElement;

  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    if (typeof window !== "undefined") {
      window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      };
      window.cancelAnimationFrame = () => undefined;
    }
  });

  beforeEach(() => {
    renderSpy.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("renders all mermaid diagrams in the preview", async () => {
    const cell: Extract<NotebookCell, { type: "markdown" }> = {
      id: "cell-1",
      type: "markdown",
      source: [
        "```mermaid",
        "graph TD; A-->B;",
        "```",
        "",
        "```mermaid",
        "sequenceDiagram",
        "A->>B: Hello",
        "```",
      ].join("\n"),
      metadata: { ui: { edit: false } },
    };

    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ThemeProvider initialTheme="light">
          <MarkdownCellView
            cell={cell}
            notebookId="notebook-1"
            onChange={noop as never}
            editorKey="key"
          />
        </ThemeProvider>
      );
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const blocks = Array.from(
      container.querySelectorAll<HTMLPreElement>("pre.mermaid")
    );

    expect(blocks).toHaveLength(2);
    expect(renderSpy).toHaveBeenCalledTimes(2);
    for (const block of blocks) {
      expect(block.querySelector("svg")).not.toBeNull();
    }
  });

  it("enters edit mode when the preview is double clicked", async () => {
    const cell: Extract<NotebookCell, { type: "markdown" }> = {
      id: "cell-2",
      type: "markdown",
      source: "Hello world",
      metadata: { ui: { edit: false } },
    };

    const onChange = vi.fn();
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ThemeProvider initialTheme="light">
          <MarkdownCellView
            cell={cell}
            notebookId="notebook-1"
            onChange={onChange as never}
            editorKey="key"
          />
        </ThemeProvider>
      );
    });

    const preview =
      container.querySelector<HTMLDivElement>(".markdown-preview");
    expect(preview).not.toBeNull();

    await act(async () => {
      preview?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const [updater, options] = onChange.mock.calls[0] as [
      (current: NotebookCell) => NotebookCell,
      { persist?: boolean; touch?: boolean } | undefined,
    ];
    const updated = updater(cell);
    expect((updated.metadata as { ui?: { edit?: boolean } }).ui?.edit).toBe(
      true
    );
    expect(options).toBeUndefined();
  });

  it("renders LaTeX expressions in the preview", async () => {
    const cell: Extract<NotebookCell, { type: "markdown" }> = {
      id: "cell-3",
      type: "markdown",
      source: ["Euler inline $e^{i\\pi} + 1 = 0$.", "", "$$E = mc^2$$"].join(
        "\n"
      ),
      metadata: { ui: { edit: false } },
    };

    const root = createRoot(container);

    await act(async () => {
      root.render(
        <ThemeProvider initialTheme="light">
          <MarkdownCellView
            cell={cell}
            notebookId="notebook-1"
            onChange={noop as never}
            editorKey="key"
          />
        </ThemeProvider>
      );
    });

    const preview =
      container.querySelector<HTMLDivElement>(".markdown-preview");
    expect(preview).not.toBeNull();

    const katexNodes = preview?.querySelectorAll(".katex");
    expect(katexNodes?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(preview?.querySelector(".katex-display")).not.toBeNull();
    expect(preview?.innerHTML ?? "").not.toContain("$$E = mc^2$$");
  });
});
