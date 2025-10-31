"use client";

import { useMemo } from "react";
import type { ThemeMode } from "@/components/theme-context";
import { renderMarkdownToHtml } from "@/components/notebook/markdown-preview-utils";
import { useMermaidRenderer } from "@/components/notebook/hooks/use-mermaid-renderer";

interface SharedMarkdownProps {
  markdown: string;
  themeMode?: ThemeMode;
  className?: string;
  cellId?: string;
}

export const SharedMarkdown = ({
  markdown,
  themeMode = "light",
  className = "",
  cellId = "shared",
}: SharedMarkdownProps) => {
  const html = useMemo(() => renderMarkdownToHtml(markdown ?? ""), [markdown]);

  const containerRef = useMermaidRenderer({
    cellId,
    html,
    theme: themeMode,
  });

  return (
    <div
      ref={containerRef}
      className={`markdown-preview p-2 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
