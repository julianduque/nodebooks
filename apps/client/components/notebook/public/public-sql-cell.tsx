"use client";

import { useMemo } from "react";
import type { NotebookCell, SqlConnection } from "@nodebooks/notebook-schema";
import { AlertCallout, TableGrid } from "@nodebooks/ui";
import {
  cn,
  describeSqlDriver,
  formatSqlTimestamp,
} from "@/components/lib/utils";
import type { ThemeMode } from "@/components/theme-context";
import { renderMarkdownToHtml } from "@/components/notebook/markdown-preview-utils";

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

export default PublicSqlCell;
