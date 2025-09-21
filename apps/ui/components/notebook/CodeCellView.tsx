"use client";

import { useCallback, useEffect, useRef } from "react";
import type { OnMount } from "@monaco-editor/react";
import MonacoEditor from "./MonacoEditorClient";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { Badge } from "../ui/badge";
import { Loader2 } from "lucide-react";
import OutputView from "./OutputView";

interface CodeCellViewProps {
  cell: Extract<NotebookCell, { type: "code" }>;
  onChange: (updater: (cell: NotebookCell) => NotebookCell) => void;
  onRun: () => void;
  isRunning: boolean;
  editorKey: string;
}

const CodeCellView = ({
  cell,
  onChange,
  onRun,
  isRunning,
  editorKey,
}: CodeCellViewProps) => {
  const runShortcutRef = useRef(onRun);

  useEffect(() => {
    runShortcutRef.current = onRun;
  }, [onRun]);

  const handleEditorMount = useCallback<OnMount>((editor, monaco) => {
    const run = () => runShortcutRef.current();
    editor.addAction({
      id: "nodebooks.run-cell",
      label: "Run Cell",
      keybindings: [
        monaco.KeyMod.Shift | monaco.KeyCode.Enter,
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      ],
      run,
    });
    editor.onDidFocusEditorWidget?.((): void => {
      const el = editor.getDomNode?.();
      if (el) {
        const article = el.closest(
          "article[id^='cell-']"
        ) as HTMLElement | null;
        if (article?.id?.startsWith("cell-")) {
          try {
            article.dispatchEvent(new Event("focus", { bubbles: true }));
          } catch {
            /* noop */
          }
        }
      }
    });
  }, []);

  const hideEditor = Boolean(
    (cell.metadata as { display?: { hideEditor?: boolean } })?.display
      ?.hideEditor
  );
  const title =
    (cell.metadata as { display?: { title?: string } })?.display?.title ??
    undefined;

  return (
    <div className="relative rounded-2xl bg-slate-950 text-slate-100 shadow-lg ring-1 ring-slate-900/60">
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        {title ? (
          <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
            {title}
          </Badge>
        ) : null}
        <Badge
          variant="secondary"
          className="px-2 py-0.5 text-[10px] tracking-wide"
        >
          {cell.language.toUpperCase()}
        </Badge>
      </div>

      {!hideEditor ? (
        <div className="overflow-hidden rounded-2xl">
          <MonacoEditor
            key={editorKey}
            path={`${cell.id}.${cell.language === "ts" ? "ts" : "js"}`}
            height="260px"
            defaultLanguage={
              cell.language === "ts" ? "typescript" : "javascript"
            }
            language={cell.language === "ts" ? "typescript" : "javascript"}
            theme="vs-dark"
            value={cell.source}
            onChange={(value) =>
              onChange(() => ({ ...cell, source: value ?? "" }))
            }
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              readOnly: isRunning,
              padding: { top: 18, bottom: 18 },
            }}
          />
        </div>
      ) : null}

      {(hideEditor || cell.outputs.length > 0) && (
        <div className="space-y-2 border-t border-slate-800 bg-slate-900/60 p-4 text-sm text-emerald-100">
          {cell.outputs.length > 0 ? (
            cell.outputs.map((output, index) => (
              <OutputView key={index} output={output} />
            ))
          ) : (
            <div className="flex items-center gap-2 text-emerald-200/80">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing
              environment…
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end border-t border-slate-800 px-4 py-2 text-xs uppercase tracking-[0.2em] text-slate-400">
        {isRunning ? (
          <span className="flex items-center gap-2 text-amber-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default CodeCellView;
