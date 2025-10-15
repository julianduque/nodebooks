"use client";
import React from "react";
import { UiThemeContext } from "./theme";
import { Markdown } from "./markdown";
import type { UiCode } from "@nodebooks/notebook-schema";

type CodeBlockProps = Omit<UiCode, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  className,
  themeMode,
}) => {
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  const codeBlock = `\`\`\`${language}\n${code}\n\`\`\``;
  return (
    <Markdown markdown={codeBlock} themeMode={mode} className={className} />
  );
};
