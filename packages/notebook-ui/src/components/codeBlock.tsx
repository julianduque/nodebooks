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
        " whitespace-pre bg-slate-900 text-slate-100 rounded p-3 overflow-auto"
      }
      style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}
    >
      <code className={language ? `language-${language}` : undefined}>
        {code}
      </code>
    </pre>
  );
};
