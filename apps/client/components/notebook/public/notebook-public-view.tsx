"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import type { Notebook } from "@nodebooks/notebook-schema";
import type { NotebookWithAccess } from "@/components/notebook/types";
import { buildOutlineItems } from "@/components/notebook/utils";
import OutlinePanel from "@/components/notebook/outline-panel";
import { cn, EMPTY_SQL_CONNECTIONS } from "@/components/lib/utils";
import { useTheme, type ThemeMode } from "@/components/theme-context";
import { Button } from "@/components/ui/button";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import PublicCell from "@/components/notebook/public/public-cell";
import { useNotebookPublicSidebar } from "@/components/notebook/hooks/use-notebook-public-sidebar";

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

const NotebookPublicView = ({
  notebook,
  project,
  notebookHrefById,
  className,
}: NotebookPublicViewProps) => {
  const outlineItems = useMemo(() => buildOutlineItems(notebook), [notebook]);
  const { theme } = useTheme();
  const {
    isDesktop,
    sidebarCollapsed,
    mobileSidebarOpen,
    handleToggleSidebar,
    handleCloseMobileSidebar,
  } = useNotebookPublicSidebar();

  const handleOutlineSelect = useCallback(
    (cellId: string) => {
      if (typeof document === "undefined") {
        return;
      }
      const element = document.getElementById(`cell-${cellId}`);
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!isDesktop) {
        handleCloseMobileSidebar();
      }
    },
    [handleCloseMobileSidebar, isDesktop]
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

  const sqlConnections = notebook?.sql?.connections ?? EMPTY_SQL_CONNECTIONS;

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
          "fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-border/60 bg-muted/40 transition-all duration-200 ease-linear lg:sticky lg:top-0 lg:flex lg:h-screen lg:translate-x-0 lg:overflow-y-auto lg:bottom-auto",
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
                <PublicCell
                  key={cell.id}
                  cell={cell}
                  theme={theme as ThemeMode}
                  connections={sqlConnections}
                />
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

export default NotebookPublicView;
