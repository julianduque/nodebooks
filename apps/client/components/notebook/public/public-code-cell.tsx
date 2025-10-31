"use client";

import { useMemo } from "react";
import type { CodeCell } from "@/types/notebook";
import { OutputView } from "@nodebooks/client-ui/components/output";
import { renderMarkdownToHtml } from "@/components/notebook/markdown-preview-utils";

const PublicCodeCell = ({ cell }: { cell: CodeCell }) => {
  const markdown = useMemo(() => {
    const language = cell.language ?? "ts";
    const source = cell.source ?? "";
    return renderMarkdownToHtml(`\`\`\`${language}\n${source}\n\`\`\``);
  }, [cell.language, cell.source]);

  return (
    <section id={`cell-${cell.id}`} className="space-y-4">
      <div
        className="markdown-preview space-y-3 text-sm leading-7 text-foreground"
        dangerouslySetInnerHTML={{ __html: markdown }}
      />
      {cell.outputs.length > 0 ? (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/40 p-4">
          {cell.outputs.map((output, index) => (
            <div key={index} className="overflow-x-auto">
              <OutputView output={output} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default PublicCodeCell;
