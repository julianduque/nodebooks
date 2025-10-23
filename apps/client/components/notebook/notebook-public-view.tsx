"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  Notebook,
  NotebookCell,
  SqlConnection,
} from "@nodebooks/notebook-schema";
import type { NotebookWithAccess } from "@/components/notebook/types";
import { buildOutlineItems } from "@/components/notebook/utils";
import OutlinePanel from "@/components/notebook/outline-panel";
import OutputView from "@/components/notebook/output-view";
import { AlertCallout, TableGrid } from "@nodebooks/ui";
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

const EMPTY_SQL_CONNECTIONS: SqlConnection[] = [];

const STRIP_ANSI = /\u001B\[[0-?]*[ -\/]*[@-~]/g;

const describeSqlDriver = (driver: SqlConnection["driver"]) => {
  switch (driver) {
    case "postgres":
      return "PostgreSQL";
    default:
      return driver;
  }
};

const formatSqlTimestamp = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleString();
  } catch {
    return null;
  }
};

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
                <PublicCell
                  key={cell.id}
                  cell={cell}
                  theme={theme}
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

const PublicCell = ({
  cell,
  theme,
  connections,
}: {
  cell: NotebookCell;
  theme: ThemeMode;
  connections: SqlConnection[];
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
  if (cell.type === "http") {
    return <PublicHttpCell cell={cell} />;
  }
  if (cell.type === "sql") {
    return (
      <PublicSqlCell cell={cell} connections={connections} theme={theme} />
    );
  }
  return null;
};

const PublicHttpCell = ({
  cell,
}: {
  cell: Extract<NotebookCell, { type: "http" }>;
}) => {
  const request = cell.request ?? {
    method: "GET",
    url: "",
    headers: [],
    query: [],
    body: { mode: "none", text: "", contentType: "application/json" },
  };
  const response = cell.response;

  const requestHeaders = useMemo(
    () =>
      Array.isArray(request.headers)
        ? request.headers.filter(
            (header) => (header.name ?? "").trim().length > 0
          )
        : [],
    [request.headers]
  );
  const queryParams = useMemo(
    () =>
      Array.isArray(request.query)
        ? request.query.filter((param) => (param.name ?? "").trim().length > 0)
        : [],
    [request.query]
  );

  const requestBody = useMemo(() => {
    if (request.body?.mode === "json" || request.body?.mode === "text") {
      return request.body.text ?? "";
    }
    return "";
  }, [request.body?.mode, request.body?.text]);

  const responseStatus = response?.status
    ? `${response.status} ${response.statusText ?? ""}`.trim()
    : null;

  const responseHeaders = useMemo(
    () =>
      Array.isArray(response?.headers)
        ? response.headers.filter(
            (header) => (header.name ?? "").trim().length > 0
          )
        : [],
    [response?.headers]
  );

  const responseBody = useMemo(() => {
    if (!response?.body) {
      return null;
    }
    if (response.body.type === "binary") {
      const size =
        typeof response.body.size === "number"
          ? `${response.body.size} bytes`
          : "binary";
      const encoding = response.body.encoding ?? "base64";
      const text = response.body.text ?? "";
      return `Binary data (${size}, ${encoding}):\n${text}`;
    }
    if (response.body.text && response.body.text.length > 0) {
      return response.body.text;
    }
    return "";
  }, [response?.body]);

  const timestampLabel = useMemo(() => {
    if (!response?.timestamp) {
      return null;
    }
    const timestamp = new Date(response.timestamp);
    if (Number.isNaN(timestamp.getTime())) {
      return response.timestamp;
    }
    return timestamp.toLocaleString();
  }, [response?.timestamp]);

  return (
    <section id={`cell-${cell.id}`} className="space-y-4 text-sm">
      <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="rounded border px-2 py-1 font-mono text-[11px] font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-200 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-0">
            {request.method ?? "GET"}
          </span>
          <span className="font-medium text-foreground">HTTP Request</span>
        </div>
        {request.url ? (
          <div className="break-words font-mono text-[13px] text-foreground">
            {request.url}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No URL configured.</p>
        )}
        {queryParams.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Query Parameters
            </p>
            <div className="rounded-md border border-border/60 bg-background/80 p-2 text-xs font-mono">
              {queryParams.map((param) => (
                <div
                  key={param.id ?? `${param.name}-${param.value}`}
                  className="flex gap-2"
                >
                  <span className="text-emerald-600 dark:text-emerald-200">
                    {param.name}
                  </span>
                  <span className="text-muted-foreground">=</span>
                  <span className="text-foreground break-all">
                    {param.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {requestHeaders.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Headers
            </p>
            <div className="rounded-md border border-border/60 bg-background/80 p-2 text-xs font-mono">
              {requestHeaders.map((header) => (
                <div
                  key={header.id ?? `${header.name}-${header.value}`}
                  className="flex gap-2"
                >
                  <span className="text-sky-500 dark:text-sky-300">
                    {header.name}
                  </span>
                  <span className="text-muted-foreground">:</span>
                  <span className="text-foreground break-all">
                    {header.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {requestBody ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Body
            </p>
            <pre className="max-h-64 overflow-auto rounded-md border border-border/60 bg-background/80 p-3 text-xs font-mono leading-relaxed">
              {requestBody}
            </pre>
          </div>
        ) : null}
      </div>

      {response ? (
        <div className="space-y-3 rounded-lg border border-border bg-card/80 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border px-2 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 shadow-sm ring-1 ring-emerald-200 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-0">
              Response
            </span>
            {timestampLabel ? (
              <span className="text-xs text-muted-foreground">
                {timestampLabel}
              </span>
            ) : null}
            {typeof response.durationMs === "number" ? (
              <span className="text-xs text-muted-foreground">
                {response.durationMs} ms
              </span>
            ) : null}
          </div>
          {response.error ? (
            <p className="text-sm font-medium text-rose-400">
              {response.error}
            </p>
          ) : (
            <div className="space-y-2">
              {responseStatus ? (
                <p className="font-medium text-foreground">{responseStatus}</p>
              ) : null}
              {response.url ? (
                <p className="font-mono text-xs text-muted-foreground break-all">
                  {response.url}
                </p>
              ) : null}
            </div>
          )}
          {responseHeaders.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Response Headers
              </p>
              <div className="rounded-md border border-border/60 bg-background/60 p-2 text-xs font-mono">
                {responseHeaders.map((header) => (
                  <div
                    key={`${header.name}-${header.value}`}
                    className="flex gap-2"
                  >
                    <span className="text-emerald-600 dark:text-emerald-200">
                      {header.name}
                    </span>
                    <span className="text-muted-foreground">:</span>
                    <span className="text-foreground break-all">
                      {header.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {responseBody ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Body
              </p>
              <pre className="max-h-72 overflow-auto rounded-md border border-border/60 bg-background/80 p-3 text-xs font-mono leading-relaxed">
                {responseBody}
              </pre>
            </div>
          ) : null}
          {response.curl ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                cURL
              </p>
              <pre className="overflow-auto rounded-md border border-border/60 bg-background/80 p-3 text-xs font-mono leading-relaxed">
                {response.curl}
              </pre>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Run this request in the editor to capture the latest response.
        </p>
      )}
    </section>
  );
};

const PublicSqlCell = ({
  cell,
  connections,
  theme,
}: {
  cell: Extract<NotebookCell, { type: "sql" }>;
  connections: SqlConnection[];
  theme: ThemeMode;
}) => {
  const connection = useMemo(() => {
    if (!cell.connectionId) {
      return null;
    }
    return (
      connections.find((candidate) => candidate.id === cell.connectionId) ??
      null
    );
  }, [cell.connectionId, connections]);

  const assignName = (cell.assignVariable ?? "").trim();
  const result = cell.result;
  const hasSuccessfulResult = Boolean(result && !result.error);

  const querySource = cell.query ?? "";
  const queryHtml = useMemo(() => {
    if (!querySource.trim()) {
      return null;
    }
    return renderMarkdownToHtml(`\`\`\`sql\n${querySource}\n\`\`\``);
  }, [querySource]);

  const tableColumns = useMemo(() => {
    if (
      !result ||
      !Array.isArray(result.columns) ||
      result.columns.length === 0
    ) {
      return undefined;
    }
    return result.columns
      .map((column) => {
        const name = column.name?.trim();
        if (!name) {
          return null;
        }
        const dataType = column.dataType?.trim();
        const label = dataType ? `${name} (${dataType})` : name;
        return { key: name, label };
      })
      .filter(
        (column): column is { key: string; label: string } => column !== null
      );
  }, [result]);

  const timestampLabel = useMemo(
    () => formatSqlTimestamp(result?.timestamp),
    [result?.timestamp]
  );

  const metadata = useMemo(() => {
    const items: string[] = [];
    if (connection) {
      const name =
        connection.name && connection.name.trim().length > 0
          ? connection.name
          : "connection";
      items.push(`Using ${name} · ${describeSqlDriver(connection.driver)}`);
    }
    if (timestampLabel) {
      items.push(`Last run ${timestampLabel}`);
    }
    if (typeof result?.rowCount === "number") {
      items.push(`${result.rowCount.toLocaleString()} rows`);
    } else if (Array.isArray(result?.rows)) {
      items.push(`${result.rows.length.toLocaleString()} rows`);
    }
    if (typeof result?.durationMs === "number") {
      items.push(`${result.durationMs.toLocaleString()} ms`);
    }
    if (result?.assignedVariable) {
      items.push(`Assigned to ${result.assignedVariable}`);
    } else if (assignName) {
      items.push(`Will assign to ${assignName} on next run`);
    }
    return items.filter((item) => item && item.trim().length > 0);
  }, [connection, timestampLabel, result, assignName]);

  const missingConnection = Boolean(cell.connectionId) && !connection;
  const isDark = theme === "dark";
  const statusChipClass = isDark
    ? "inline-flex items-center rounded-full border border-slate-700/60 bg-slate-900/80 px-2 py-0.5 text-[11px] font-medium text-slate-200"
    : "inline-flex items-center rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground";

  return (
    <section
      id={`cell-${cell.id}`}
      className="space-y-4 text-sm text-foreground"
    >
      <div className="space-y-4 rounded-lg border border-border/60 bg-muted/40 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="rounded border px-2 py-1 font-mono text-[11px] font-semibold text-sky-700 shadow-sm ring-1 ring-sky-200 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-0">
            SQL
          </span>
          <span className="text-foreground">Query</span>
        </div>
        {queryHtml ? (
          <div
            className="markdown-preview space-y-3 text-sm leading-7 text-foreground"
            dangerouslySetInnerHTML={{ __html: queryHtml }}
          />
        ) : (
          <p className="text-xs text-muted-foreground">
            No SQL query has been published for this cell.
          </p>
        )}
        {missingConnection ? (
          <AlertCallout
            level="warn"
            text="The connection configured for this query is not available in the published notebook."
            className="text-left"
            themeMode={theme}
          />
        ) : null}
        {result?.error ? (
          <AlertCallout
            level="error"
            text={result.error}
            className="text-left"
            themeMode={theme}
          />
        ) : null}
        {hasSuccessfulResult ? (
          <div
            className={cn(
              "rounded-xl p-3",
              isDark
                ? "border border-slate-800/70 bg-slate-950/70"
                : "bg-card shadow-sm"
            )}
          >
            <TableGrid
              rows={result?.rows ?? []}
              columns={tableColumns}
              density="compact"
              themeMode={theme}
            />
          </div>
        ) : !result?.error ? (
          <p className="text-xs text-muted-foreground">
            Run this query in the editor to capture results for the published
            view.
          </p>
        ) : null}
        {metadata.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {metadata.map((item, index) => (
              <span key={index} className={statusChipClass}>
                {item}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
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
