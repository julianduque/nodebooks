"use client";
import React from "react";
import type { UiTable } from "@nodebooks/notebook-schema";
import {
  compareValues,
  deriveColumns,
  renderCellValue,
  useComponentThemeMode,
} from "./utils.js";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

type TableGridProps = Omit<UiTable, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};

export const TableGrid: React.FC<TableGridProps> = ({
  rows,
  columns,
  sort,
  page,
  density = "normal",
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const cols = React.useMemo(
    () => deriveColumns(rows, columns),
    [rows, columns]
  );
  const [sortKey, setSortKey] = React.useState<string | null>(
    sort?.key ?? null
  );
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">(
    sort?.direction ?? "asc"
  );
  const [pageIndex, setPageIndex] = React.useState(page?.index ?? 0);
  const [pageSize, setPageSize] = React.useState(page?.size ?? 20);

  const sorted = React.useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((r1, r2) => {
      const v1 = (r1 as Record<string, unknown>)[sortKey];
      const v2 = (r2 as Record<string, unknown>)[sortKey];
      const cmp = compareValues(v1, v2);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const total = sorted.length;
  const maxPage = Math.max(0, Math.ceil(total / pageSize) - 1);
  const clampedIndex = Math.min(Math.max(0, pageIndex), maxPage);
  const pageRows = React.useMemo(() => {
    const start = clampedIndex * pageSize;
    const end = start + pageSize;
    return sorted.slice(start, end);
  }, [sorted, clampedIndex, pageSize]);

  const cellPad =
    density === "compact"
      ? "px-2 py-1"
      : density === "spacious"
        ? "px-4 py-3"
        : "px-3 py-2";

  const onHeaderClick = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPageIndex(0);
  };

  return (
    <div
      data-theme-mode={mode}
      className={clsx("relative space-y-2", className)}
    >
      <div className="overflow-auto rounded-xl border border-border bg-card text-card-foreground shadow-sm">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              {cols.map(
                (c: {
                  key: string;
                  label?: string;
                  align?: "left" | "center" | "right";
                }) => (
                  <th
                    key={c.key}
                    className={clsx(
                      "sticky top-0 z-10 select-none border-b border-border/70 bg-muted/80 text-left text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground transition-colors",
                      "hover:text-foreground",
                      cellPad
                    )}
                    onClick={() => onHeaderClick(c.key)}
                  >
                    <span>{c.label ?? c.key}</span>
                    {sortKey === c.key && (
                      <span className="ml-1 text-[0.65rem] text-muted-foreground">
                        {sortDir === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr
                key={i}
                className={clsx(
                  "border-b border-border/40 transition-colors",
                  i % 2 === 0 ? "bg-background" : "bg-muted/40"
                )}
              >
                {cols.map(
                  (c: {
                    key: string;
                    label?: string;
                    align?: "left" | "center" | "right";
                  }) => {
                    const v = (r as Record<string, unknown>)[c.key];
                    const align = c.align ?? "left";
                    return (
                      <td
                        key={c.key}
                        className={clsx(
                          "border-border/40 text-sm align-top text-foreground",
                          cellPad,
                          align === "right"
                            ? "text-right"
                            : align === "center"
                              ? "text-center"
                              : "text-left"
                        )}
                      >
                        {renderCellValue(v)}
                      </td>
                    );
                  }
                )}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td
                  className={clsx(
                    "border border-dashed border-border/50 text-sm text-muted-foreground",
                    cellPad
                  )}
                  colSpan={cols.length}
                >
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            disabled={clampedIndex <= 0}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.min(maxPage, p + 1))}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            disabled={clampedIndex >= maxPage}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-foreground">
          <span>
            Page {clampedIndex + 1} / {maxPage + 1}
          </span>
          <label className="inline-flex items-center gap-1">
            <span>Rows:</span>
            <select
              className="h-8 appearance-none rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs transition focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
              value={pageSize}
              onChange={(e) => {
                const size = Number(e.target.value) || 20;
                setPageSize(size);
                setPageIndex(0);
              }}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <span className="text-muted-foreground">{total} total</span>
        </div>
      </div>
    </div>
  );
};
