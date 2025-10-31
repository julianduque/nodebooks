"use client";

import { useMemo } from "react";
import type { NotebookCell } from "@nodebooks/notebook-schema";
import { normalizeBuffer } from "@nodebooks/client-ui/lib/utils";
import type { CommandCell } from "../../schema.js";

// Simple markdown code block renderer
const renderCodeBlock = (code: string, language = "shell"): string => {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return `<pre><code class="language-${language}">${escaped}</code></pre>`;
};

// Simple markdown renderer for notes
const renderMarkdown = (text: string): string => {
  // Very basic markdown rendering - just escape HTML
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  // Convert newlines to <br>
  const withBreaks = escaped.replace(/\n/g, "<br>");
  return `<p>${withBreaks}</p>`;
};

type CommandCellType = CommandCell & NotebookCell;

export const PublicCommandCell = ({ cell }: { cell: CommandCellType }) => {
  const commandMarkdown = useMemo(() => {
    const command = normalizeBuffer(cell.command ?? "");
    const content = command ? `$ ${command}` : "";
    return renderCodeBlock(content, "shell");
  }, [cell.command]);
  const notesHtml = useMemo(() => {
    const notes = cell.notes?.trim();
    return notes ? renderMarkdown(notes) : null;
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
