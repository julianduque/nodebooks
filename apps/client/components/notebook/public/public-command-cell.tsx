"use client";

import { useMemo } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { renderMarkdownToHtml } from "@/components/notebook/markdown-preview-utils";
import { normalizeBuffer } from "@/components/lib/utils";

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

export default PublicCommandCell;
