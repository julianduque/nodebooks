"use client";

import { getMonaco } from "@/components/notebook/monaco-setup";

type CodeCell = {
  id: string;
  type: "code";
  language: "js" | "ts";
  source: string;
};

export function cellUri(
  notebookId: string,
  order: number,
  cell: Pick<CodeCell, "id" | "language">
) {
  const ext = cell.language === "ts" ? "ts" : "js";
  const path = `nb:///notebooks/${encodeURIComponent(
    notebookId
  )}/cells/${order.toString().padStart(4, "0")}-${cell.id}.${ext}`;
  return path;
}

// Ensure a Monaco model exists for the provided cell (create or update)
export function ensureCellModel(opts: {
  notebookId: string;
  order: number;
  cell: CodeCell;
  skipIfExists?: boolean;
}) {
  const monaco = getMonaco();
  if (!monaco) return null;
  const uriStr = cellUri(opts.notebookId, opts.order, opts.cell);
  const uri = monaco.Uri.parse(uriStr);
  let model = monaco.editor.getModel(uri);
  if (!model) {
    const language = opts.cell.language === "ts" ? "typescript" : "javascript";
    model = monaco.editor.createModel(opts.cell.source ?? "", language, uri);
    return model;
  }
  if (!opts.skipIfExists) {
    if (model.getValue() !== (opts.cell.source ?? "")) {
      model.setValue(opts.cell.source ?? "");
    }
  }
  return model;
}

export function disposeCellModel(uriStr: string) {
  const monaco = getMonaco();
  if (!monaco) return;
  const uri = monaco.Uri.parse(uriStr);
  const model = monaco.editor.getModel(uri);
  if (model) {
    try {
      model.dispose();
    } catch {}
  }
}
