import React from "react";
import type { UiMarkdown } from "@nodebooks/notebook-schema";
import DOMPurify from "dompurify";
import { marked } from "marked";

type MarkdownProps = UiMarkdown & { className?: string };
export const Markdown: React.FC<MarkdownProps> = ({ markdown, className }) => {
  const html = marked.parse(markdown ?? "");
  const safe = DOMPurify.sanitize(String(html), { ADD_ATTR: ["style"] });
  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />
  );
};
