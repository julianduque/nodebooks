"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import {
  MonacoEditor,
  initMonaco,
  MONACO_EDITOR_CONTAINER_CLASS,
  MONACO_EDITOR_WRAPPER_CLASS,
} from "@nodebooks/client-ui/components/monaco";
import type { CodeCell, NotebookCell } from "@/types/notebook";
import type { UiInteractionEvent } from "@nodebooks/ui";
import { Badge, CopyButton } from "@nodebooks/client-ui/components/ui";
import { Loader2, Zap } from "lucide-react";
import { OutputView } from "@nodebooks/client-ui/components/output";
import { useTheme } from "@/components/theme-context";
import {
  DEFAULT_CODE_EDITOR_SETTINGS,
  type MonacoEditorSettings,
} from "@/components/notebook/editor-preferences";

interface CodeCellViewProps {
  cell: CodeCell;
  path?: string;
  onChange: (
    updater: (cell: NotebookCell) => NotebookCell,
    options?: { persist?: boolean; touch?: boolean }
  ) => void;
  onRun: () => void;
  isRunning: boolean;
  queued?: boolean;
  isGenerating?: boolean;
  editorKey: string;
  readOnly?: boolean;
  onUiInteraction?: (event: UiInteractionEvent) => Promise<void> | void;
}

const CodeCellView = ({
  cell,
  path,
  onChange,
  onRun,
  isRunning,
  queued,
  isGenerating = false,
  editorKey,
  readOnly = false,
  onUiInteraction,
}: CodeCellViewProps) => {
  const runShortcutRef = useRef(onRun);
  // Start at roughly one visual line + padding (updated on mount)
  const [editorHeight, setEditorHeight] = useState<number>(60);
  const heightRef = useRef(0);
  const { theme } = useTheme();
  const monacoTheme = theme === "dark" ? "vs-dark" : "vs-dark";
  const editorPrefs =
    (cell.metadata as { editor?: MonacoEditorSettings }).editor ?? {};
  const editorFontSize =
    editorPrefs.fontSize ?? DEFAULT_CODE_EDITOR_SETTINGS.fontSize;
  const editorWordWrap =
    editorPrefs.wordWrap ?? DEFAULT_CODE_EDITOR_SETTINGS.wordWrap;
  const editorMinimap =
    editorPrefs.minimap ?? DEFAULT_CODE_EDITOR_SETTINGS.minimap;
  const editorLineNumbers =
    editorPrefs.lineNumbers ?? DEFAULT_CODE_EDITOR_SETTINGS.lineNumbers;
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
        const width = dom?.clientWidth ?? dom?.parentElement?.clientWidth ?? 0;
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

  const handleBeforeMount = useCallback<BeforeMount>((monaco) => {
    initMonaco(monaco);
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
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="pointer-events-none absolute left-1 top-1 z-10 flex items-center gap-2">
        {isGenerating ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Loader2 className="h-3 w-3 animate-spin" /> Generating
          </span>
        ) : isRunning ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--chart-5)_25%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--chart-5)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--chart-5)]" />
            Running
          </span>
        ) : execCount !== null ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"
            title={`Last run #${execCount}`}
          >
            <Zap className="h-3 w-3 text-primary" /> {execCount}
          </span>
        ) : null}
        {!isRunning && !isGenerating && queued ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--accent)_35%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
            <span className="h-2 w-2 rounded-full bg-accent-foreground/70" />
            Queued
          </span>
        ) : null}
      </div>
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        <CopyButton
          value={() => cell.source ?? ""}
          aria-label="Copy cell source"
          variant="dark"
        />
        {title ? (
          <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
            {title}
          </Badge>
        ) : null}
        <Badge
          variant="default"
          className="px-2 py-0.5 text-[10px] tracking-wide"
        >
          {cell.language.toUpperCase()}
        </Badge>
      </div>

      {!hideEditor ? (
        <div className={MONACO_EDITOR_WRAPPER_CLASS}>
          <MonacoEditor
            className={MONACO_EDITOR_CONTAINER_CLASS}
            key={editorKey}
            path={path ?? `${cell.id}.${cell.language === "ts" ? "ts" : "js"}`}
            height={editorHeight || 0}
            defaultLanguage={
              cell.language === "ts" ? "typescript" : "javascript"
            }
            language={cell.language === "ts" ? "typescript" : "javascript"}
            theme={monacoTheme}
            value={cell.source}
            onChange={(value: string | undefined) =>
              onChange(() => ({ ...cell, source: value ?? "" }))
            }
            onMount={handleEditorMount}
            beforeMount={handleBeforeMount}
            options={{
              minimap: { enabled: editorMinimap },
              fontSize: editorFontSize,
              lineNumbers: editorLineNumbers,
              scrollBeyondLastLine: false,
              wordWrap: editorWordWrap,
              automaticLayout: true,
              readOnly: readOnly || isRunning || isGenerating,
              fixedOverflowWidgets: true,
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
        <div className="space-y-3 border-t border-border/60 bg-card px-4 py-4 text-sm text-card-foreground">
          {cell.outputs.length > 0 ? (
            cell.outputs.map((output, index) => (
              <OutputView
                key={index}
                output={output}
                onInteraction={onUiInteraction}
              />
            ))
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing
              environment…
            </div>
          )}
        </div>
      )}

      {isRunning && (
        <div className="flex items-center justify-end px-4 py-2 text-xs tracking-[0.2em] text-muted-foreground">
          <span className="flex items-center gap-2 text-[color:var(--chart-5)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…
          </span>
        </div>
      )}
      {!isRunning && isGenerating && (
        <div className="flex items-center justify-end px-4 py-2 text-xs tracking-[0.2em] text-primary">
          <span className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
          </span>
        </div>
      )}
    </div>
  );
};

export default CodeCellView;
