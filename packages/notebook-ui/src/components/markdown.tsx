"use client";
import React from "react";
import { UiThemeContext } from "./theme";
import type { UiMarkdown } from "@nodebooks/notebook-schema";
import DOMPurify from "dompurify";
import { marked } from "marked";

type MarkdownProps = Omit<UiMarkdown, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
export const Markdown: React.FC<MarkdownProps> = ({
  markdown,
  className,
  themeMode,
}) => {
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  const html = marked.parse(markdown ?? "");
  const safe =
    typeof window === "undefined"
      ? String(html)
      : DOMPurify.sanitize(String(html), { ADD_ATTR: ["style"] });
  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        className={`markdown-preview rounded-md border p-3 ${
          mode === "light"
            ? "bg-white text-slate-800 border-slate-200"
            : "bg-slate-900 text-slate-200 border-slate-800"
        }`}
        style={
          mode === "dark"
            ? ({
                "--foreground": "#e5e7eb",
                "--muted": "#1f2937",
                "--muted-foreground": "#cbd5e1",
                "--border": "#334155",
              } as React.CSSProperties & Record<`--${string}`, string>)
            : undefined
        }
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    </div>
  );
};
