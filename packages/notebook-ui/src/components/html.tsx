import React from "react";
import type { UiHtml } from "@nodebooks/notebook-schema";
import DOMPurify from "dompurify";

type HtmlProps = UiHtml & { className?: string };
export const HtmlBlock: React.FC<HtmlProps> = ({ html, className }) => {
  const safe = DOMPurify.sanitize(html ?? "", { ADD_ATTR: ["style"] });
  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: safe }} />
  );
};
