"use client";

import { useMemo } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import type { ThemeMode } from "@/components/theme-context";
import { renderMarkdownToHtml } from "@/components/notebook/markdown-preview-utils";
import { useMermaidRenderer } from "@/components/notebook/hooks/use-mermaid-renderer";

const PublicMarkdownCell = ({
  cell,
  theme,
}: {
  cell: Extract<NotebookCell, { type: "markdown" }>;
  theme: ThemeMode;
}) => {
  const html = useMemo(
    () => renderMarkdownToHtml(cell.source ?? ""),
    [cell.source]
  );
  const containerRef = useMermaidRenderer({
    cellId: cell.id,
    html,
    theme,
  });

  return (
    <section
      id={`cell-${cell.id}`}
      className="markdown-preview space-y-3 text-base leading-7 text-foreground"
    >
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
};

export default PublicMarkdownCell;
