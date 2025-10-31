"use client";

import { useMemo } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { normalizeBuffer } from "@nodebooks/client-ui/lib/utils";
import type { TerminalCell } from "../../schema.js";

// Simple markdown code block renderer for terminal output
const renderCodeBlock = (code: string, language = "shell"): string => {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return `<pre><code class="language-${language}">${escaped}</code></pre>`;
};

type TerminalCellType = TerminalCell & NotebookCell;

export const PublicTerminalCell = ({ cell }: { cell: TerminalCellType }) => {
  const normalized = useMemo(() => normalizeBuffer(cell.buffer), [cell.buffer]);
  const html = useMemo(() => {
    if (!normalized) {
      return "";
    }
    return renderCodeBlock(normalized, "shell");
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
