"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import DOMPurify from "dompurify";
import MonacoEditor from "@/components/notebook/monaco-editor-client";
import { initMonaco } from "@/components/notebook/monaco-setup";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import {
  useAttachmentDropzone,
  useAttachmentUploader,
  type AttachmentMetadata,
} from "@/components/notebook/attachment-utils";
import {
  DEFAULT_MARKDOWN_EDITOR_SETTINGS,
  type MonacoEditorSettings,
} from "./editor-preferences";
import {
  loadMermaid,
  renderMarkdownToHtml,
  waitNextTick,
} from "./markdown-preview-utils";

interface MarkdownCellViewProps {
  cell: Extract<NotebookCell, { type: "markdown" }>;
  path?: string;
  notebookId: string;
  onChange: (
    updater: (cell: NotebookCell) => NotebookCell,
    options?: { persist?: boolean; touch?: boolean }
  ) => void;
  editorKey: string;
  onAttachmentUploaded?: (attachment: AttachmentMetadata, url: string) => void;
  readOnly?: boolean;
}
const stripMarkdownUnsafeChars = (value: string) =>
  value.replace(/[\[\]\(\)]/g, "\\$&");

const escapeMarkdownAltText = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "image";
  return trimmed.replace(/[[\]]/g, "\\$&");
};

const MarkdownCellView = ({
  cell,
  path,
  notebookId,
  onChange,
  editorKey,
  onAttachmentUploaded,
  readOnly = false,
}: MarkdownCellViewProps) => {
  // Start at roughly one visual line + padding (updated on mount)
  const [editorHeight, setEditorHeight] = useState<number>(10);
  const heightRef = useRef(0);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [previewEl, setPreviewEl] = useState<HTMLDivElement | null>(null);
  const setPreviewRef = useCallback((node: HTMLDivElement | null) => {
    previewRef.current = node;
    setPreviewEl(node);
  }, []);
  const html = useMemo(
    () => renderMarkdownToHtml(cell.source ?? ""),
    [cell.source]
  );

  type MarkdownUIMeta = { ui?: { edit?: boolean } };
  const isEditing = readOnly
    ? false
    : ((cell.metadata as MarkdownUIMeta).ui?.edit ?? true);
  const editorPrefs =
    (cell.metadata as { editor?: MonacoEditorSettings }).editor ?? {};
  const editorFontSize =
    editorPrefs.fontSize ?? DEFAULT_MARKDOWN_EDITOR_SETTINGS.fontSize;
  const editorWordWrap =
    editorPrefs.wordWrap ?? DEFAULT_MARKDOWN_EDITOR_SETTINGS.wordWrap;
  const editorMinimap =
    editorPrefs.minimap ?? DEFAULT_MARKDOWN_EDITOR_SETTINGS.minimap;
  const editorLineNumbers =
    editorPrefs.lineNumbers ?? DEFAULT_MARKDOWN_EDITOR_SETTINGS.lineNumbers;

  const { uploadFiles, isUploading, uploadStatus, uploadError } =
    useAttachmentUploader({
      notebookId,
      onUploaded: onAttachmentUploaded,
    });

  const handleUploadedFiles = useCallback(
    async (files: File[]) => {
      if (readOnly) {
        return;
      }
      const results = await uploadFiles(files);
      if (results.length === 0) {
        return;
      }

      const snippets = results.map(({ attachment, url }) => {
        const baseName = attachment.filename.replace(/\.[^.]+$/, "");
        const altText = escapeMarkdownAltText(baseName || attachment.filename);
        const linkText = stripMarkdownUnsafeChars(attachment.filename);
        return attachment.mimeType.startsWith("image/")
          ? `![${altText}](${url})`
          : `[${linkText}](${url})`;
      });

      onChange(
        (current) => {
          if (current.type !== "markdown") return current;
          const existing = current.source ?? "";
          const trimmed = existing.trimEnd();
          const segments: string[] = [];
          if (trimmed) segments.push(trimmed);
          segments.push(snippets.join("\n\n"));
          const nextSource = segments.join("\n\n");
          return { ...current, source: nextSource };
        },
        { persist: true }
      );
    },
    [readOnly, uploadFiles, onChange]
  );

  const {
    isDraggingOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useAttachmentDropzone({
    disabled: isUploading || readOnly,
    onFiles: handleUploadedFiles,
  });

  const renderCacheRef = useRef<Map<string, string>>(new Map());

  useLayoutEffect(() => {
    const container = previewEl;
    if (!container) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let retries = 0;

    const renderMermaid = async () => {
      if (cancelled) return;
      observer?.disconnect();

      await waitNextTick();
      if (cancelled) return;

      const blocks = Array.from(
        container.querySelectorAll<HTMLElement>("pre.mermaid")
      );
      if (blocks.length === 0) {
        if (!cancelled && retries < 3) {
          retries += 1;
          window.setTimeout(() => {
            if (!cancelled) void renderMermaid();
          }, 16);
        } else if (!cancelled) {
          observer?.observe(container, { childList: true, subtree: true });
        }
        return;
      }
      retries = 0;

      const mermaid = await loadMermaid();
      let index = 0;

      for (const block of blocks) {
        if (cancelled) break;

        const definitionAttr = block.dataset.definition ?? "";
        const definition = definitionAttr
          ? decodeURIComponent(definitionAttr)
          : (block.textContent ?? "");
        if (!definition) continue;

        const cacheKey = `${cell.id}::${definition}`;
        const cached = renderCacheRef.current.get(cacheKey);
        if (cached) {
          block.innerHTML = cached;
          block.setAttribute("data-processed", "1");
          block.setAttribute("data-rendered-definition", definition);
          continue;
        }

        try {
          const { svg } = await mermaid.render(
            `mermaid-${cell.id}-${index++}`,
            definition
          );
          if (cancelled || !container.contains(block)) continue;

          const sanitized = DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
            ADD_TAGS: ["style", "foreignObject"],
            ADD_ATTR: ["style", "class"],
          });

          renderCacheRef.current.set(cacheKey, sanitized);
          block.innerHTML = sanitized;
          block.setAttribute("data-processed", "1");
          block.setAttribute("data-rendered-definition", definition);
        } catch (error) {
          if (cancelled || !container.contains(block)) continue;
          block.classList.add("mermaid-error");
          block.textContent =
            error instanceof Error ? error.message : String(error);
          block.setAttribute("data-processed", "1");
          block.removeAttribute("data-rendered-definition");
          renderCacheRef.current.delete(cacheKey);
        }
      }

      if (!cancelled) {
        observer?.observe(container, { childList: true, subtree: true });
      }
    };

    observer = new MutationObserver(() => {
      void renderMermaid();
    });
    observer.observe(container, { childList: true, subtree: true });

    void renderMermaid();
    const fallbackTimer = window.setTimeout(() => {
      if (!cancelled) void renderMermaid();
    }, 50);

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.clearTimeout(fallbackTimer);
    };
  }, [cell.id, previewEl, html]);

  // moved isEditing above to use inside effects

  const setEdit = useCallback(
    (edit: boolean) => {
      onChange(
        (current) => {
          if (current.type !== "markdown") return current;
          const next: NotebookCell = {
            ...current,
            metadata: {
              ...current.metadata,
              ui: { ...((current.metadata as MarkdownUIMeta).ui ?? {}), edit },
            },
          };
          return next;
        },
        edit ? undefined : { persist: true }
      );
    },
    [onChange]
  );

  const handlePreviewDoubleClick = useCallback(() => {
    if (isEditing) return;
    setEdit(true);
  }, [isEditing, setEdit]);

  const handleMount = useCallback<OnMount>(
    (editor, monaco) => {
      editor.addAction({
        id: "nodebooks.md.done",
        label: "Done Editing",
        keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.Enter],
        run: () => {
          editor.trigger("keyboard", "editor.action.formatDocument", undefined);
          const nextValue = editor.getValue();
          onChange(
            (current) =>
              current.type === "markdown"
                ? { ...current, source: nextValue ?? "" }
                : current,
            { persist: true }
          );
          setEdit(false);
        },
      });

      // Auto-resize from 1 line to fit content
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
          const width =
            dom?.parentElement?.clientWidth ?? dom?.clientWidth ?? 0;
          if (width > 0) {
            editor.layout({ width, height: h });
          }
        } catch {
          // noop
        }
      };

      // Initial size and listeners
      applyHeight(computeHeight());
      const d1 = editor.onDidContentSizeChange(() => {
        applyHeight(computeHeight());
      });
      const d2 = editor.onDidChangeConfiguration(() => {
        applyHeight(computeHeight());
      });
      const onResize = () => applyHeight(computeHeight());
      window.addEventListener("resize", onResize);

      return () => {
        d1.dispose();
        d2.dispose();
        window.removeEventListener("resize", onResize);
      };
    },
    [onChange, setEdit]
  );

  const handleBeforeMount = useCallback<BeforeMount>((monaco) => {
    initMonaco(monaco);
  }, []);

  return (
    <div
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl text-card-foreground"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isUploading ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="rounded-md bg-background/95 px-4 py-2 text-xs font-medium text-foreground shadow">
            {uploadStatus
              ? `Uploading attachment ${uploadStatus.current} of ${uploadStatus.total}…`
              : "Uploading attachment…"}
          </div>
        </div>
      ) : null}
      {isDraggingOver ? (
        <div className="pointer-events-none absolute inset-0 z-10 border-2 border-dashed border-primary/70 bg-primary/10" />
      ) : null}
      {isEditing ? (
        <div className="relative">
          <div className="px-5 pt-5">
            <MonacoEditor
              className="rounded-xl border border-slate-800/70 bg-slate-950/80 shadow-inner overflow-hidden"
              key={editorKey}
              path={path ?? `${cell.id}.md`}
              height={editorHeight || 0}
              language="markdown"
              defaultLanguage="markdown"
              theme="vs-dark"
              value={cell.source}
              onMount={handleMount}
              beforeMount={handleBeforeMount}
              onChange={(value: string | undefined) =>
                onChange((current) =>
                  current.type === "markdown"
                    ? { ...current, source: value ?? "" }
                    : current
                )
              }
              options={{
                minimap: { enabled: editorMinimap },
                fontSize: editorFontSize,
                lineNumbers: editorLineNumbers,
                scrollBeyondLastLine: false,
                wordWrap: editorWordWrap,
                automaticLayout: true,
                fixedOverflowWidgets: true,
                padding: { top: 12, bottom: 12 },
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
          <div
            className="markdown-preview space-y-3 bg-card px-5 pb-5 pt-4 text-sm leading-7 text-card-foreground"
            ref={setPreviewRef}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      ) : (
        <div className="relative px-5 py-5">
          <div
            className="markdown-preview space-y-3 text-sm leading-7 text-card-foreground"
            ref={setPreviewRef}
            onDoubleClick={handlePreviewDoubleClick}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
      {uploadError ? (
        <p className="px-5 pb-5 text-xs text-rose-500">{uploadError}</p>
      ) : null}
    </div>
  );
};

export default MarkdownCellView;
