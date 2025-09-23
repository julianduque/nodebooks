"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OnMount } from "@monaco-editor/react";
import MonacoEditor from "./MonacoEditorClient";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { Badge } from "../ui/badge";
import { Loader2, Zap } from "lucide-react";
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
  // Start at roughly one visual line + padding (updated on mount)
  const [editorHeight, setEditorHeight] = useState<number>(60);
  const heightRef = useRef(0);

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

    // Focus bubbling to the cell container for toolbar visibility
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

    // Auto-resize: start at 1 line and grow to fit content
    const computeHeight = () => {
      const lineHeight = editor.getOption(
        monaco.editor.EditorOption.lineHeight
      ) as number;
      const padding = editor.getOption(monaco.editor.EditorOption.padding) as
        | { top: number; bottom: number }
        | undefined;
      const minHeight =
        lineHeight + (padding?.top ?? 0) + (padding?.bottom ?? 0);
      const contentHeight = Math.ceil(editor.getContentHeight());
      const newHeight = Math.max(minHeight, contentHeight);
      return newHeight;
    };

    const applyHeight = (h: number) => {
      if (h === heightRef.current) return;
      heightRef.current = h;
      setEditorHeight(h);
      try {
        const dom = editor.getDomNode?.();
        const width = dom?.parentElement?.clientWidth ?? dom?.clientWidth ?? 0;
        if (width > 0) {
          editor.layout({ width, height: h });
        }
      } catch {
        // noop
      }
    };

    // Initial sizing
    applyHeight(computeHeight());

    // Listen to content size changes
    const d1 = editor.onDidContentSizeChange(() => {
      applyHeight(computeHeight());
    });

    // Also adjust on configuration change (e.g., font size)
    const d2 = editor.onDidChangeConfiguration(() => {
      applyHeight(computeHeight());
    });

    // And on window resize, since width affects wrapping
    const onResize = () => applyHeight(computeHeight());
    window.addEventListener("resize", onResize);

    return () => {
      d1.dispose();
      d2.dispose();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const hideEditor = Boolean(
    (cell.metadata as { display?: { hideEditor?: boolean } })?.display
      ?.hideEditor
  );
  const execCount = ((cell.metadata as { display?: { execCount?: number } })
    ?.display?.execCount ?? null) as number | null;
  const title =
    (cell.metadata as { display?: { title?: string } })?.display?.title ??
    undefined;

  return (
    <div className="relative rounded-2xl bg-slate-950 text-slate-100 shadow-lg ring-1 ring-slate-900/60">
      <div className="pointer-events-none absolute left-1 top-1 z-10 flex items-center gap-2">
        {isRunning ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            Running
          </span>
        ) : execCount !== null ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200"
            title={`Last run #${execCount}`}
          >
            <Zap className="h-3 w-3 text-emerald-400" /> {execCount}
          </span>
        ) : null}
      </div>
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
            height={editorHeight || 0}
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
              wordWrap: "on",
              automaticLayout: true,
              readOnly: isRunning,
              padding: { top: 18, bottom: 18 },
              scrollbar: {
                vertical: "hidden",
                horizontal: "auto",
                handleMouseWheel: false,
                alwaysConsumeMouseWheel: false,
              },
              overviewRulerLanes: 0,
            }}
          />
        </div>
      ) : null}

      {(hideEditor || cell.outputs.length > 0) && (
        <div className="space-y-2 border-t border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-100">
          {cell.outputs.length > 0 ? (
            cell.outputs.map((output, index) => (
              <OutputView key={index} output={output} />
            ))
          ) : (
            <div className="flex items-center gap-2 text-slate-300/80">
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
