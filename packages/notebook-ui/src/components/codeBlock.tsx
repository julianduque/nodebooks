import React from "react";
import type { UiCode } from "@nodebooks/notebook-schema";

type CodeBlockProps = UiCode & { className?: string };
export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  wrap,
  className,
}) => {
  return (
    <pre
      className={
        (className ?? "") +
        " whitespace-pre bg-slate-100 text-slate-800 rounded border border-slate-200 p-3 overflow-auto"
      }
      style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}
    >
      <code className={language ? `language-${language}` : undefined}>
        {code}
      </code>
    </pre>
  );
};
