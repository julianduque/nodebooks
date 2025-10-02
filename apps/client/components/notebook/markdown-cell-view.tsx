"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import { Marked, Renderer, type Tokens } from "marked";
import MonacoEditor from "@/components/notebook/monaco-editor-client";
import { initMonaco } from "@/components/notebook/monaco-setup";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import {
  useAttachmentDropzone,
  useAttachmentUploader,
  type AttachmentMetadata,
} from "@/components/notebook/attachment-utils";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
}

const stripMarkdownUnsafeChars = (value: string) =>
  value.replace(/[\[\]\(\)]/g, "\\$&");

const markdownRenderer = new Marked({
  gfm: true,
  breaks: true,
});

const normalizeLanguage = (lang?: string) => {
  const language = lang?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!language) return undefined;
  return /^[a-z0-9#+_-]+$/.test(language) ? language : undefined;
};

const highlightCode = (code: string, language?: string) => {
  const lang = normalizeLanguage(language);
  if (lang) {
    try {
      if (hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
    } catch {
      /* no-op */
    }
  }
  try {
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
};

const renderer = new Renderer();

renderer.code = ({ text, lang }: Tokens.Code) => {
  const language = normalizeLanguage(lang);
  if (language === "mermaid") {
    const encoded = encodeURIComponent(text);
    return `<pre class="mermaid" data-definition="${encoded}">${escapeHtml(text)}</pre>`;
  }
  const classNames = ["hljs"];
  if (language) classNames.push(`language-${language}`);
  const highlighted = highlightCode(text, language);
  return `<pre><code class="${classNames.join(" ")}">${highlighted}</code></pre>`;
};

markdownRenderer.use({ renderer });

const loadMermaid = (() => {
  let mermaidPromise: Promise<typeof import("mermaid")> | null = null;
  let initialized = false;
  return async () => {
    if (!mermaidPromise) {
      mermaidPromise = import("mermaid");
    }
    const mermaidModule = await mermaidPromise;
    const mermaid = mermaidModule.default;
    if (!initialized) {
      mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
      initialized = true;
    }
    return mermaid;
  };
})();

const waitNextTick = () =>
  typeof window === "undefined"
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 0);
        if (typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => {
            window.clearTimeout(timer);
            resolve();
          });
        }
      });

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
  const html = useMemo(() => {
    const parsed = markdownRenderer.parse(cell.source ?? "", { async: false });
    const rendered = typeof parsed === "string" ? parsed : "";
    return DOMPurify.sanitize(rendered);
  }, [cell.source]);

  type MarkdownUIMeta = { ui?: { edit?: boolean } };
  const isEditing = (cell.metadata as MarkdownUIMeta).ui?.edit ?? true;

  const { uploadFiles, isUploading, uploadStatus, uploadError } =
    useAttachmentUploader({
      notebookId,
      onUploaded: onAttachmentUploaded,
    });

  const handleUploadedFiles = useCallback(
    async (files: File[]) => {
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
    [uploadFiles, onChange]
  );

  const {
    isDraggingOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useAttachmentDropzone({
    disabled: isUploading,
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
      className="relative flex flex-col gap-3"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isUploading ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/70 backdrop-blur-sm">
          <div className="rounded-md bg-background/90 px-4 py-2 text-xs font-medium text-foreground shadow">
            {uploadStatus
              ? `Uploading attachment ${uploadStatus.current} of ${uploadStatus.total}…`
              : "Uploading attachment…"}
          </div>
        </div>
      ) : null}
      {isDraggingOver ? (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-xl border-2 border-dashed border-primary/80 bg-primary/10" />
      ) : null}
      {isEditing ? (
        <div className="relative rounded-xl border border-border bg-transparent">
          <MonacoEditor
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
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              wordWrap: "on",
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
          <div
            className="markdown-preview space-y-3 border-t border-border p-5 text-sm leading-7 text-foreground"
            ref={setPreviewRef}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      ) : (
        <div className="relative">
          <div
            className="markdown-preview space-y-3 rounded-xl border border-transparent p-5 text-sm leading-7 text-foreground transition group-hover/cell:border-border"
            ref={setPreviewRef}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      )}
      {uploadError ? (
        <p className="text-xs text-rose-500">{uploadError}</p>
      ) : null}
    </div>
  );
};

export default MarkdownCellView;
