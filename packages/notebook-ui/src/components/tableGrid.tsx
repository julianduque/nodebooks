"use client";
import React from "react";
import { UiThemeContext } from "./theme";
import type { UiTable } from "@nodebooks/notebook-schema";
import { compareValues, deriveColumns, renderCellValue } from "./utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
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
    <div className={`relative ${className ?? ""}`}>
      <div
        className={`overflow-auto rounded-md border ${
          mode === "light"
            ? "border-slate-200 bg-white"
            : "border-slate-800 bg-slate-900"
        }`}
      >
        <table className="min-w-full border-collapse">
          <thead
            className={mode === "light" ? "" : ""}
            style={{ background: "var(--muted)" }}
          >
            <tr>
              {cols.map(
                (c: {
                  key: string;
                  label?: string;
                  align?: "left" | "center" | "right";
                }) => (
                  <th
                    key={c.key}
                    className={`sticky top-0 z-10 select-none cursor-pointer text-left text-sm font-semibold ${cellPad} border ${
                      mode === "light" ? "text-slate-700" : "text-slate-100"
                    }`}
                    style={{
                      borderColor: "var(--border)",
                      background: "var(--muted)",
                    }}
                    onClick={() => onHeaderClick(c.key)}
                  >
                    <span>{c.label ?? c.key}</span>
                    {sortKey === c.key && (
                      <span
                        className={
                          mode === "light"
                            ? "ml-1 text-xs text-slate-400"
                            : "ml-1 text-xs text-slate-400"
                        }
                      >
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
                className={`${
                  mode === "light"
                    ? i % 2 === 0
                      ? "bg-white"
                      : "bg-slate-50"
                    : i % 2 === 0
                      ? "bg-slate-900"
                      : "bg-slate-800/60"
                }`}
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
                        className={`${cellPad} text-sm align-top border ${
                          align === "right"
                            ? "text-right"
                            : align === "center"
                              ? "text-center"
                              : "text-left"
                        } ${mode === "light" ? "text-slate-700" : "text-slate-200"}`}
                        style={{ borderColor: "var(--border)" }}
                      >
                        {renderCellValue(v, mode)}
                      </td>
                    );
                  }
                )}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td
                  className={`${cellPad} text-sm border ${
                    mode === "light" ? "text-slate-500" : "text-slate-400"
                  }`}
                  style={{ borderColor: "var(--border)" }}
                  colSpan={cols.length}
                >
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div
        className={`mt-2 flex items-center justify-between text-sm ${
          mode === "light" ? "text-slate-700" : "text-slate-300"
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            className={`inline-flex h-8 items-center gap-1 rounded px-3 disabled:opacity-50 ${
              mode === "light"
                ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                : "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
            disabled={clampedIndex <= 0}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.min(maxPage, p + 1))}
            className={`inline-flex h-8 items-center gap-1 rounded px-3 disabled:opacity-50 ${
              mode === "light"
                ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                : "border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
            disabled={clampedIndex >= maxPage}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
        <div
          className={`flex items-center gap-3 ${mode === "light" ? "text-slate-700" : "text-slate-200"}`}
        >
          <span>
            Page {clampedIndex + 1} / {maxPage + 1}
          </span>
          <label className="inline-flex items-center gap-1">
            <span>Rows:</span>
            <select
              className={`h-8 rounded px-2 ${
                mode === "light"
                  ? "border border-slate-300 bg-white text-slate-700"
                  : "border border-slate-700 bg-slate-800 text-slate-200"
              }`}
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
          <span
            className={mode === "light" ? "text-slate-500" : "text-slate-400"}
          >
            {total} total
          </span>
        </div>
      </div>
    </div>
  );
};
