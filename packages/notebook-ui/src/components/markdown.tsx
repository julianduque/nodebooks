"use client";
import React from "react";
import { UiThemeContext } from "./theme";
import type { UiMarkdown } from "@nodebooks/notebook-schema";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import { Marked, Renderer, type Tokens } from "marked";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeLanguage = (lang?: string) => {
  const language = lang?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!language) return undefined;
  return /^[a-z0-9#+_-]+$/.test(language) ? language : undefined;
};

const highlightCode = (code: string, language?: string) => {
  const lang = normalizeLanguage(language);
  if (lang) {
    try {
      if (hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
    } catch {
      /* no-op */
    }
  }
  try {
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
};

const markdownRenderer = new Marked({
  gfm: true,
  breaks: true,
});

const renderer = new Renderer();

renderer.code = ({ text, lang }: Tokens.Code) => {
  const language = normalizeLanguage(lang);
  const classNames = ["hljs"];
  if (language) classNames.push(`language-${language}`);
  const highlighted = highlightCode(text, language);
  return `<pre><code class="${classNames.join(" ")}">${highlighted}</code></pre>`;
};

markdownRenderer.use({ renderer });

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
  const html = markdownRenderer.parse(markdown ?? "", { async: false });
  const safe =
    typeof window === "undefined"
      ? String(html)
      : DOMPurify.sanitize(String(html), { ADD_ATTR: ["style"] });
  return (
    <div className={`relative ${className ?? ""}`}>
      <div
        className={`markdown-preview rounded-md border p-3 ${
          mode === "light"
            ? "bg-slate-100 text-slate-800 border-slate-200"
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
