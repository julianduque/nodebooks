import React from "react";
import type { UiTable } from "@nodebooks/notebook-schema";
import { compareValues, deriveColumns, renderCellValue } from "./utils";

type TableGridProps = UiTable & { className?: string };

export const TableGrid: React.FC<TableGridProps> = ({
  rows,
  columns,
  sort,
  page,
  density = "normal",
  className,
}) => {
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
    <div className={className}>
      <div className="overflow-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full border-collapse">
          <thead className="bg-slate-50">
            <tr>
              {cols.map(
                (c: {
                  key: string;
                  label?: string;
                  align?: "left" | "center" | "right";
                }) => (
                  <th
                    key={c.key}
                    className={`text-left text-slate-700 text-sm font-semibold ${cellPad} border-b border-slate-200 select-none cursor-pointer`}
                    onClick={() => onHeaderClick(c.key)}
                  >
                    <span>{c.label ?? c.key}</span>
                    {sortKey === c.key && (
                      <span className="ml-1 text-xs text-slate-400">
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
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
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
                        className={`${cellPad} text-slate-700 text-sm border-b border-slate-200 align-top ${
                          align === "right"
                            ? "text-right"
                            : align === "center"
                              ? "text-center"
                              : "text-left"
                        }`}
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
                  className={`${cellPad} text-slate-500 text-sm`}
                  colSpan={cols.length}
                >
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex items-center justify-between text-sm text-slate-700">
        <div className="space-x-2">
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
            className="rounded border border-slate-300 bg-slate-100 px-2 py-1 disabled:opacity-50"
            disabled={clampedIndex <= 0}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPageIndex((p) => Math.min(maxPage, p + 1))}
            className="rounded border border-slate-300 bg-slate-100 px-2 py-1 disabled:opacity-50"
            disabled={clampedIndex >= maxPage}
          >
            Next
          </button>
        </div>
        <div className="flex items-center space-x-3">
          <span>
            Page {clampedIndex + 1} / {maxPage + 1}
          </span>
          <label className="inline-flex items-center space-x-1">
            <span>Rows:</span>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1"
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
          <span className="text-slate-500">{total} total</span>
        </div>
      </div>
    </div>
  );
};
