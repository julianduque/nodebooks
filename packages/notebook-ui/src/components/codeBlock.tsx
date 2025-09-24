"use client";
import React from "react";
import { UiThemeContext } from "./theme";
import type { UiCode } from "@nodebooks/notebook-schema";

type CodeBlockProps = Omit<UiCode, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  wrap,
  className,
  themeMode,
}) => {
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  return (
    <div className={`relative ${className ?? ""}`}>
      <pre
        className={`whitespace-pre rounded-md border p-3 font-mono text-sm overflow-auto ${
          mode === "light"
            ? "bg-slate-50 text-slate-800 border-slate-200"
            : "bg-slate-900 text-slate-200 border-slate-800"
        }`}
        style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}
      >
        <code className={language ? `language-${language}` : undefined}>
          {code}
        </code>
      </pre>
    </div>
  );
};
