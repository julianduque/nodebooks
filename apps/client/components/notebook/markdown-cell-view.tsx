"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import { Marked, Renderer, type Tokens } from "marked";
import MonacoEditor from "@/components/notebook/monaco-editor-client";
import { initMonaco } from "@/components/notebook/monaco-setup";
import type { NotebookCell } from "@nodebooks/notebook-schema";

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
  onChange: (
    updater: (cell: NotebookCell) => NotebookCell,
    options?: { persist?: boolean; touch?: boolean }
  ) => void;
  editorKey: string;
}

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

const escapeMarkdownAltText = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "image";
  return trimmed.replace(/[[\]]/g, "\\$&");
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file"));
    };
    reader.readAsDataURL(file);
  });

const MarkdownCellView = ({
  cell,
  path,
  onChange,
  editorKey,
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

  useEffect(() => {
    const container = previewEl;
    if (!container) return;

    let cancelled = false;
    let scheduled = false;

    const renderMermaid = async () => {
      const blocks = Array.from(
        container.querySelectorAll<HTMLElement>(
          "pre.mermaid:not([data-processed])"
        )
      );
      if (blocks.length === 0) return;

      const mermaidModule = await import("mermaid");
      const mermaid = mermaidModule.default;
      mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
      let index = 0;
      for (const block of blocks) {
        const definitionAttr = block.dataset.definition ?? "";
        const definition = definitionAttr
          ? decodeURIComponent(definitionAttr)
          : (block.textContent ?? "");
        if (!definition) continue;
        try {
          const { svg } = await mermaid.render(
            `mermaid-${cell.id}-${index++}`,
            definition
          );
          if (cancelled) return;
          block.innerHTML = DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true, svgFilters: true },
            // Allow mermaid's inline styles and style tags inside the SVG
            ADD_TAGS: ["style", "foreignObject"],
            ADD_ATTR: ["style", "class"],
          });
          block.setAttribute("data-processed", "1");
        } catch (error) {
          if (cancelled) return;
          block.classList.add("mermaid-error");
          block.replaceChildren(
            document.createTextNode(
              error instanceof Error ? error.message : String(error)
            )
          );
          block.setAttribute("data-processed", "1");
        }
      }
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (!cancelled) void renderMermaid();
      });
    };

    // initial pass after mount/commit and whenever html changes
    schedule();

    // observe any content replacement in preview (e.g., after cell persist)
    const observer = new MutationObserver(schedule);
    observer.observe(container, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
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

  const dragDepthRef = useRef(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const isFileDrag = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const types = Array.from(event.dataTransfer?.types ?? []);
    return types.includes("Files");
  }, []);

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDraggingOver(false);
  }, []);

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingOver(true);
    },
    [isFileDrag]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [isFileDrag]
  );

  const handleDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDraggingOver(false);
      }
    },
    [isFileDrag]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      resetDragState();

      const files = Array.from(event.dataTransfer?.files ?? []);
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));
      if (imageFiles.length === 0) return;

      void Promise.allSettled(
        imageFiles.map(async (file) => ({
          file,
          dataUrl: await readFileAsDataUrl(file),
        }))
      ).then((results) => {
        const attachments = results
          .filter(
            (result): result is PromiseFulfilledResult<{ file: File; dataUrl: string }> =>
              result.status === "fulfilled"
          )
          .map(({ value }) => {
            const baseName = value.file.name.replace(/\.[^.]+$/, "");
            const altText = escapeMarkdownAltText(baseName);
            return `![${altText}](${value.dataUrl})`;
          });

        if (attachments.length === 0) return;

        onChange(
          (current) => {
            if (current.type !== "markdown") return current;
            const existing = current.source ?? "";
            const trimmed = existing.trimEnd();
            const segments = [] as string[];
            if (trimmed) segments.push(trimmed);
            segments.push(attachments.join("\n\n"));
            const nextSource = segments.join("\n\n");
            return { ...current, source: nextSource };
          },
          { persist: true }
        );
      });
    },
    [isFileDrag, onChange, resetDragState]
  );

  return (
    <div
      className="relative flex flex-col gap-3"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingOver ? (
        <div className="pointer-events-none absolute inset-0 rounded-xl border-2 border-dashed border-primary/80 bg-primary/10" />
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
    </div>
  );
};

export default MarkdownCellView;
