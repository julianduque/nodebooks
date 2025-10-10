"use client";

import DOMPurify from "dompurify";
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
      /* no-op */
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

const isElementWithClassList = (
  value: unknown
): value is Element & { closest?: (selector: string) => Element | null } => {
  if (typeof Element !== "undefined" && value instanceof Element) {
    return true;
  }
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const maybeClassList = (value as { classList?: unknown }).classList;
  if (
    !maybeClassList ||
    typeof maybeClassList !== "object" ||
    !("contains" in maybeClassList) ||
    typeof (maybeClassList as DOMTokenList).contains !== "function"
  ) {
    return false;
  }
  const maybeClosest = (value as { closest?: unknown }).closest;
  if (maybeClosest && typeof maybeClosest !== "function") {
    return false;
  }
  return true;
};

const ensureKatexStyleRetention = (() => {
  let applied = false;
  return () => {
    if (applied) return;
    if (typeof window === "undefined") {
      return;
    }
    if (typeof DOMPurify.addHook !== "function") {
      return;
    }
    DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
      if (data.attrName !== "style") return;
      if (!isElementWithClassList(node)) return;
      const hasKatexAncestor =
        node.classList.contains("katex") ||
        (typeof node.closest === "function" && node.closest(".katex") !== null);
      if (hasKatexAncestor) {
        data.keepAttr = true;
      }
    });
    applied = true;
  };
})();

ensureKatexStyleRetention();

export const renderMarkdownToHtml = (source: string) => {
  const parsed = markdownRenderer.parse(source ?? "", { async: false });
  const rendered = typeof parsed === "string" ? parsed : "";
  return DOMPurify.sanitize(rendered);
};

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
