"use client";

import { useMemo } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { renderMarkdownToHtml } from "@/components/notebook/markdown-preview-utils";
import { normalizeBuffer } from "@/components/lib/utils";

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

export default PublicTerminalCell;
