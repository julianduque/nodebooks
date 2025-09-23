import React from "react";

export const deriveColumns = (
  rows: Array<Record<string, unknown>>,
  explicit?: Array<{
    key: string;
    label?: string;
    align?: "left" | "center" | "right";
  }>
) => {
  if (explicit && explicit.length > 0) return explicit;
  const seen = new Set<string>();
  const cols: {
    key: string;
    label?: string;
    align?: "left" | "center" | "right";
  }[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        cols.push({ key, label: key });
      }
    }
  }
  return cols;
};

export const compareValues = (a: unknown, b: unknown) => {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  const ta = typeof a;
  const tb = typeof b;
  if (ta === "number" && tb === "number") return (a as number) - (b as number);
  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};

export const renderCellValue = (v: unknown) => {
  if (v === null) return <span className="text-slate-500">null</span>;
  if (typeof v === "undefined")
    return <span className="text-slate-500">—</span>;
  if (typeof v === "number")
    return <span className="text-sky-700">{String(v)}</span>;
  if (typeof v === "boolean")
    return <span className="text-pink-700">{String(v)}</span>;
  if (typeof v === "string") return <span className="text-slate-700">{v}</span>;
  if (Array.isArray(v))
    return <span className="text-slate-600">[{v.length}]</span>;
  if (typeof v === "object")
    return <span className="text-slate-600">{"{…}"}</span>;
  return <span className="text-slate-700">{String(v)}</span>;
};
