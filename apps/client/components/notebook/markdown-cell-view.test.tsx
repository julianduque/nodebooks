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
import MarkdownCellView from "./markdown-cell-view";

const noop = () => undefined;

describe("MarkdownCellView mermaid rendering", () => {
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
        <MarkdownCellView
          cell={cell}
          notebookId="notebook-1"
          onChange={noop as never}
          editorKey="key"
        />
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
});
