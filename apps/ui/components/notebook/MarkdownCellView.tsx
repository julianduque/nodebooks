"use client";

import { useCallback, useMemo } from "react";
import type { OnMount } from "@monaco-editor/react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import MonacoEditor from "./MonacoEditorClient";
import type { NotebookCell } from "@nodebooks/notebook-schema";

interface MarkdownCellViewProps {
  cell: Extract<NotebookCell, { type: "markdown" }>;
  onChange: (updater: (cell: NotebookCell) => NotebookCell) => void;
  editorKey: string;
}

const MarkdownCellView = ({
  cell,
  onChange,
  editorKey,
}: MarkdownCellViewProps) => {
  const html = useMemo(() => {
    const parsed = marked.parse(cell.source ?? "", { async: false });
    const rendered = typeof parsed === "string" ? parsed : "";
    return DOMPurify.sanitize(rendered);
  }, [cell.source]);

  type MarkdownUIMeta = { ui?: { edit?: boolean } };
  const isEditing = (cell.metadata as MarkdownUIMeta).ui?.edit ?? true;

  const setEdit = useCallback(
    (edit: boolean) => {
      onChange((current) => {
        if (current.type !== "markdown") return current;
        const next: NotebookCell = {
          ...current,
          metadata: {
            ...current.metadata,
            ui: { ...((current.metadata as MarkdownUIMeta).ui ?? {}), edit },
          },
        };
        return next;
      });
    },
    [onChange]
  );

  const handleMount = useCallback<OnMount>(
    (editor, monaco) => {
      editor.addAction({
        id: "nodebooks.md.done",
        label: "Done Editing",
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter],
        run: () => {
          editor.trigger("keyboard", "editor.action.formatDocument", undefined);
          setEdit(false);
        },
      });
    },
    [setEdit]
  );

  return (
    <div className="flex flex-col gap-3">
      {isEditing ? (
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-transparent">
          <MonacoEditor
            key={editorKey}
            path={`${cell.id}.md`}
            height="220px"
            language="markdown"
            defaultLanguage="markdown"
            theme="vs-dark"
            value={cell.source}
            onMount={handleMount}
            onChange={(value) =>
              onChange(() => ({ ...cell, source: value ?? "" }))
            }
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              padding: { top: 12, bottom: 12 },
            }}
          />
          <div
            className="markdown-preview space-y-3 border-t border-slate-200 p-5 text-sm leading-7 text-slate-700"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      ) : (
        <div className="relative">
          <div
            className="markdown-preview space-y-3 rounded-xl border border-transparent p-5 text-sm leading-7 text-slate-700 transition group-hover/cell:border-slate-200"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
    </div>
  );
};

export default MarkdownCellView;
