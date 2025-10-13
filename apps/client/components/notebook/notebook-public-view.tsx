"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Notebook, NotebookCell } from "@nodebooks/notebook-schema";
import type { NotebookWithAccess } from "@/components/notebook/types";
import { buildOutlineItems } from "@/components/notebook/utils";
import OutlinePanel from "@/components/notebook/outline-panel";
import OutputView from "@/components/notebook/output-view";
import { cn } from "@/components/lib/utils";
import { useTheme, type ThemeMode } from "@/components/theme-context";
import { Button } from "@/components/ui/button";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import {
  loadMermaid,
  renderMarkdownToHtml,
  sanitizeSvg,
  waitNextTick,
} from "@/components/notebook/markdown-preview-utils";

interface PublicProject {
  id: string;
  name: string;
  notebooks: (Notebook | NotebookWithAccess | PublicNotebookExtras)[];
}

type PublicNotebookExtras = Notebook & {
  published?: boolean | null;
  publishedAt?: string | null;
  isPublished?: boolean | null;
  visibility?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

interface NotebookPublicViewProps {
  notebook: Notebook | null;
  project?: PublicProject | null;
  notebookHrefById?: Record<string, string | null | undefined>;
  className?: string;
}

const STRIP_ANSI = /\u001B\[[0-?]*[ -\/]*[@-~]/g;

const isNotebookPublished = (
  entry: Notebook | NotebookWithAccess | PublicNotebookExtras
) => {
  const candidate = entry as PublicNotebookExtras;
  if (typeof candidate.published === "boolean") {
    return candidate.published;
  }
  if (typeof candidate.isPublished === "boolean") {
    return candidate.isPublished;
  }
  if (typeof candidate.visibility === "string") {
    return candidate.visibility.toLowerCase() === "published";
  }
  if (typeof candidate.status === "string") {
    return candidate.status.toLowerCase() === "published";
  }
  if (
    typeof candidate.publishedAt === "string" &&
    candidate.publishedAt.trim().length > 0
  ) {
    return true;
  }
  const metadata = candidate.metadata;
  if (metadata && typeof metadata === "object") {
    const meta = metadata as Record<string, unknown>;
    const metaPublished = meta.published;
    if (typeof metaPublished === "boolean") {
      return metaPublished;
    }
    const metaVisibility = meta.visibility;
    if (typeof metaVisibility === "string") {
      if (metaVisibility.toLowerCase() === "published") {
        return true;
      }
    }
    const metaStatus = meta.status;
    if (typeof metaStatus === "string") {
      if (metaStatus.toLowerCase() === "published") {
        return true;
      }
    }
    const metaPublishedAt = meta.publishedAt;
    if (
      typeof metaPublishedAt === "string" &&
      metaPublishedAt.trim().length > 0
    ) {
      return true;
    }
  }
  return false;
};

const normalizeBuffer = (value: string | null | undefined) => {
  if (!value) return "";
  return value.replace(STRIP_ANSI, "").replace(/\r/g, "");
};

const NotebookPublicView = ({
  notebook,
  project,
  notebookHrefById,
  className,
}: NotebookPublicViewProps) => {
  const outlineItems = useMemo(() => buildOutlineItems(notebook), [notebook]);
  const { theme } = useTheme();
  const [isDesktop, setIsDesktop] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
    };

    setIsDesktop(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", handleChange);
      } else if (typeof mediaQuery.removeListener === "function") {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    if (isDesktop) {
      setMobileSidebarOpen(false);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileSidebarOpen]);

  const handleToggleSidebar = useCallback(() => {
    if (isDesktop) {
      setSidebarCollapsed((prev) => !prev);
      return;
    }
    setMobileSidebarOpen((prev) => !prev);
  }, [isDesktop]);

  const handleCloseMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, []);

  const handleOutlineSelect = useCallback(
    (cellId: string) => {
      if (typeof document === "undefined") {
        return;
      }
      const element = document.getElementById(`cell-${cellId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!isDesktop) {
        setMobileSidebarOpen(false);
      }
    },
    [isDesktop]
  );

  const publishedProjectNotebooks = useMemo(() => {
    if (!project)
      return [] as (Notebook | NotebookWithAccess | PublicNotebookExtras)[];
    const list = Array.isArray(project.notebooks) ? [...project.notebooks] : [];
    return list.filter((entry) =>
      notebook
        ? entry.id === notebook.id || isNotebookPublished(entry)
        : isNotebookPublished(entry)
    );
  }, [project, notebook]);

  return (
    <div
      className={cn(
        "relative flex min-h-screen w-full bg-background text-foreground",
        className
      )}
    >
      <div
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity duration-200 ease-linear lg:hidden",
          mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={handleCloseMobileSidebar}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-shrink-0 flex-col border-r border-border/60 bg-muted/40 transition-all duration-200 ease-linear lg:sticky lg:top-0 lg:flex lg:h-screen lg:translate-x-0 lg:overflow-y-auto lg:bottom-auto",
          mobileSidebarOpen
            ? "translate-x-0"
            : "-translate-x-full lg:translate-x-0",
          sidebarCollapsed
            ? "lg:w-0 lg:-translate-x-full lg:border-r-0 lg:opacity-0 lg:pointer-events-none"
            : "lg:w-72 lg:translate-x-0"
        )}
        aria-hidden={!mobileSidebarOpen && !isDesktop ? true : undefined}
      >
        {project ? (
          <div className="border-b border-border/60 px-4 py-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Project
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {project.name}
            </p>
            {publishedProjectNotebooks.length > 0 ? (
              <nav className="mt-3 space-y-1">
                {publishedProjectNotebooks.map((entry) => {
                  const isActive = notebook?.id === entry.id;
                  const href = notebookHrefById?.[entry.id ?? ""] ?? null;
                  const itemClass = cn(
                    "block rounded-md px-2 py-1 text-sm transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  );
                  if (href) {
                    return (
                      <Link
                        key={entry.id}
                        href={{ pathname: href }}
                        className={itemClass}
                        aria-current={isActive ? "page" : undefined}
                        onClick={() => {
                          if (!isDesktop) {
                            handleCloseMobileSidebar();
                          }
                        }}
                      >
                        <span className="block truncate">{entry.name}</span>
                      </Link>
                    );
                  }
                  return (
                    <span
                      key={entry.id}
                      className={itemClass}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span className="block truncate">{entry.name}</span>
                    </span>
                  );
                })}
              </nav>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                No published notebooks in this project.
              </p>
            )}
          </div>
        ) : null}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Outline
          </p>
          <div className="mt-3 pr-2">
            <OutlinePanel
              items={outlineItems}
              onSelect={handleOutlineSelect}
              activeCellId={undefined}
            />
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur-sm">
          <div className="relative flex h-16 items-center gap-3 px-4 sm:gap-4 lg:px-6">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={handleToggleSidebar}
                aria-label="Toggle outline sidebar"
              >
                {isDesktop ? (
                  sidebarCollapsed ? (
                    <PanelLeftOpen className="h-4 w-4" />
                  ) : (
                    <PanelLeftClose className="h-4 w-4" />
                  )
                ) : mobileSidebarOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Menu className="h-4 w-4" />
                )}
              </Button>
            </div>
            {notebook ? (
              <span
                className="min-w-0 flex-1 truncate text-base font-semibold text-foreground"
                title={notebook.name}
              >
                {notebook.name}
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
                Notebook
              </span>
            )}
            {project ? (
              <div className="hidden items-center gap-2 lg:flex">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Project
                </p>
                <span className="text-sm font-semibold text-foreground">
                  {project.name}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        {notebook ? (
          <article className="mx-auto w-full max-w-4xl px-6 py-12">
            <div className="mt-10 space-y-12">
              {notebook.cells.map((cell) => (
                <PublicCell key={cell.id} cell={cell} theme={theme} />
              ))}
            </div>
          </article>
        ) : (
          <div className="flex h-full items-center justify-center px-6 py-12 text-center text-muted-foreground">
            Notebook unavailable.
          </div>
        )}
      </main>
    </div>
  );
};

const PublicCell = ({
  cell,
  theme,
}: {
  cell: NotebookCell;
  theme: ThemeMode;
}) => {
  if (cell.type === "markdown") {
    return <PublicMarkdownCell cell={cell} theme={theme} />;
  }
  if (cell.type === "code") {
    return <PublicCodeCell cell={cell} />;
  }
  if (cell.type === "terminal") {
    return <PublicTerminalCell cell={cell} />;
  }
  if (cell.type === "command") {
    return <PublicCommandCell cell={cell} />;
  }
  return null;
};

const PublicMarkdownCell = ({
  cell,
  theme,
}: {
  cell: Extract<NotebookCell, { type: "markdown" }>;
  theme: ThemeMode;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const html = useMemo(
    () => renderMarkdownToHtml(cell.source ?? ""),
    [cell.source]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const renderMermaid = async () => {
      if (cancelled) return;
      observer?.disconnect();
      await waitNextTick();
      if (cancelled) return;
      const blocks = Array.from(
        container.querySelectorAll<HTMLElement>("pre.mermaid")
      );
      if (blocks.length === 0) {
        if (!cancelled) {
          observer?.observe(container, { childList: true, subtree: true });
        }
        return;
      }
      const mermaid = await loadMermaid(theme);
      let index = 0;
      for (const block of blocks) {
        if (cancelled) break;
        const definitionAttr = block.dataset.definition ?? "";
        const definition = definitionAttr
          ? decodeURIComponent(definitionAttr)
          : (block.textContent ?? "");
        if (!definition) continue;
        const cacheKey = `${theme}::${cell.id}::${definition}`;
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          block.innerHTML = cached;
          block.setAttribute("data-processed", "1");
          block.setAttribute("data-rendered-definition", definition);
          continue;
        }
        try {
          const { svg } = await mermaid.render(
            `publish-mermaid-${cell.id}-${index++}`,
            definition
          );
          if (cancelled || !container.contains(block)) continue;
          const sanitized = sanitizeSvg(svg);
          cacheRef.current.set(cacheKey, sanitized);
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
          cacheRef.current.delete(cacheKey);
        }
      }
      if (!cancelled) {
        observer?.observe(container, { childList: true, subtree: true });
      }
    };

    observer = new MutationObserver(() => {
      void renderMermaid();
    });
    void renderMermaid();

    return () => {
      cancelled = true;
      observer?.disconnect();
      observer = null;
    };
  }, [cell.id, html, theme]);

  return (
    <section
      id={`cell-${cell.id}`}
      className="markdown-preview space-y-3 text-base leading-7 text-foreground"
    >
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
};

const PublicCodeCell = ({
  cell,
}: {
  cell: Extract<NotebookCell, { type: "code" }>;
}) => {
  const markdown = useMemo(() => {
    const language = cell.language ?? "ts";
    const source = cell.source ?? "";
    return renderMarkdownToHtml(`\`\`\`${language}\n${source}\n\`\`\``);
  }, [cell.language, cell.source]);

  return (
    <section id={`cell-${cell.id}`} className="space-y-4">
      <div
        className="markdown-preview space-y-3 text-sm leading-7 text-foreground"
        dangerouslySetInnerHTML={{ __html: markdown }}
      />
      {cell.outputs.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/40 p-4">
          {cell.outputs.map((output, index) => (
            <div key={index} className="overflow-x-auto">
              <OutputView output={output} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};

const PublicTerminalCell = ({
  cell,
}: {
  cell: Extract<NotebookCell, { type: "terminal" }>;
}) => {
  const normalized = useMemo(() => normalizeBuffer(cell.buffer), [cell.buffer]);
  const html = useMemo(() => {
    if (!normalized) {
      return "";
    }
    return renderMarkdownToHtml(`\`\`\`shell\n${normalized}\n\`\`\``);
  }, [normalized]);

  return (
    <section
      id={`cell-${cell.id}`}
      className="markdown-preview space-y-3 text-sm leading-7 text-foreground"
    >
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
};

const PublicCommandCell = ({
  cell,
}: {
  cell: Extract<NotebookCell, { type: "command" }>;
}) => {
  const commandMarkdown = useMemo(() => {
    const command = normalizeBuffer(cell.command ?? "");
    const content = command ? `$ ${command}` : "";
    return renderMarkdownToHtml(`\`\`\`shell\n${content}\n\`\`\``);
  }, [cell.command]);
  const notesHtml = useMemo(() => {
    const notes = cell.notes?.trim();
    return notes ? renderMarkdownToHtml(notes) : null;
  }, [cell.notes]);

  return (
    <section id={`cell-${cell.id}`} className="space-y-4">
      <div
        className="markdown-preview space-y-3 text-sm leading-7 text-foreground"
        dangerouslySetInnerHTML={{ __html: commandMarkdown }}
      />
      {notesHtml ? (
        <div
          className="markdown-preview space-y-3 text-sm leading-7 text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: notesHtml }}
        />
      ) : null}
    </section>
  );
};

export default NotebookPublicView;
