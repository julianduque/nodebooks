"use client";

import hljs from "highlight.js";
import { Marked, Renderer, type Tokens } from "marked";
import markedKatex from "marked-katex-extension";

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
      // ignore
    }
  }
  try {
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
};

const renderer = new Renderer();

renderer.code = ({ text, lang }: Tokens.Code) => {
  const language = normalizeLanguage(lang);
  if (language === "mermaid") {
    const encoded = encodeURIComponent(text);
    return `<pre class="mermaid" data-definition="${encoded}">${escapeHtml(text)}</pre>`;
  }
  const classNames = ["hljs"];
  if (language) classNames.push(`language-${language}`);
  const highlighted = highlightCode(text, language);
  return `<pre><code class="${classNames.join(" ")}">${highlighted}</code></pre>`;
};

renderer.html = ({ text }: Tokens.HTML) => escapeHtml(text);

const markdownRenderer = new Marked({
  gfm: true,
  breaks: true,
});

markdownRenderer.use({ renderer });

markdownRenderer.use(
  markedKatex({
    throwOnError: false,
    output: "htmlAndMathml",
  })
);

const sanitizeHtml = (raw: string) => {
  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/data:text\/html/gi, "");
};

export const renderMarkdownToHtml = (source: string) => {
  const parsed = markdownRenderer.parse(source ?? "", { async: false });
  const rendered = typeof parsed === "string" ? parsed : "";
  return sanitizeHtml(rendered);
};

export const sanitizeSvg = (svg: string) =>
  sanitizeHtml(svg).replace(/<\/?(html|body)[^>]*>/gi, "");

export const sanitizeHtmlSnippet = sanitizeHtml;

export const loadMermaid = (() => {
  let mermaidPromise: Promise<typeof import("mermaid")> | null = null;
  let initialized = false;
  return async () => {
    if (!mermaidPromise) {
      mermaidPromise = import("mermaid");
    }
    const mermaidModule = await mermaidPromise;
    const mermaid = mermaidModule.default;
    if (!initialized) {
      mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
      initialized = true;
    }
    return mermaid;
  };
})();

export const waitNextTick = () =>
  typeof window === "undefined"
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 0);
        if (typeof window.requestAnimationFrame === "function") {
          window.requestAnimationFrame(() => {
            window.clearTimeout(timer);
            resolve();
          });
        }
      });
