"use client";

import DOMPurify from "isomorphic-dompurify";
import type { Config as DomPurifyConfig } from "dompurify";
import hljs from "highlight.js";
import { Marked, Renderer, type Tokens } from "marked";
import markedKatex from "marked-katex-extension";
import type { MermaidConfig } from "mermaid";

import type { ThemeMode } from "@/components/theme-context";

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

const DEFAULT_ADD_ATTR: readonly string[] = [
  "class",
  "style",
  "target",
  "rel",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "data-footnote-ref",
  "data-footnote-backref",
];

const mergeUnique = (base: readonly string[], extras?: readonly string[]) => {
  if (!extras || extras.length === 0) {
    return [...base];
  }
  return Array.from(new Set([...base, ...extras]));
};

const createDomPurifyConfig = (config?: DomPurifyConfig): DomPurifyConfig => {
  const merged: DomPurifyConfig = {
    ...config,
    ADD_ATTR: mergeUnique(DEFAULT_ADD_ATTR, config?.ADD_ATTR),
  };

  if (config?.ADD_TAGS) {
    merged.ADD_TAGS = Array.from(new Set(config.ADD_TAGS));
  }

  if (!config?.USE_PROFILES) {
    merged.USE_PROFILES = { html: true };
  } else if (config.USE_PROFILES) {
    merged.USE_PROFILES = { ...config.USE_PROFILES };
  }

  return merged;
};

const sanitizeHtml = (raw: string, config?: DomPurifyConfig) =>
  DOMPurify.sanitize(raw, createDomPurifyConfig(config));

export const renderMarkdownToHtml = (source: string) => {
  const parsed = markdownRenderer.parse(source ?? "", { async: false });
  const rendered = typeof parsed === "string" ? parsed : "";
  return sanitizeHtml(rendered);
};

export const sanitizeSvg = (svg: string) =>
  sanitizeHtml(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["style", "foreignObject"],
    ADD_ATTR: ["xmlns", "xmlns:xlink", "xlink:href"],
  }).replace(/<\/?(html|body)[^>]*>/gi, "");

export const sanitizeHtmlSnippet = (snippet: string) =>
  sanitizeHtml(snippet, { ADD_TAGS: ["span"] });

const resolveThemeMode = (override?: ThemeMode): ThemeMode => {
  if (override) {
    return override;
  }
  if (typeof document !== "undefined") {
    const declared = document.documentElement.dataset.theme;
    if (declared === "dark") {
      return "dark";
    }
  }
  return "light";
};

const readCssVariable = (name: string): string | undefined => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return undefined;
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const STANDARD_COLOR_PATTERN = /^(#|rgba?\(|hsla?\()/i;

const COLOR_FALLBACKS: Record<
  ThemeMode,
  {
    background: string;
    foreground: string;
    primary: string;
    primaryForeground: string;
    border: string;
    muted: string;
    card: string;
  }
> = {
  light: {
    background: "#ffffff",
    foreground: "#0f172a",
    primary: "#2563eb",
    primaryForeground: "#f8fafc",
    border: "#cbd5f5",
    muted: "#f1f5f9",
    card: "#ffffff",
  },
  dark: {
    background: "#0f172a",
    foreground: "#e2e8f0",
    primary: "#38bdf8",
    primaryForeground: "#0f172a",
    border: "#334155",
    muted: "#1f2937",
    card: "#111827",
  },
};

let colorProbe: HTMLSpanElement | null = null;

const ensureColorProbe = (): HTMLSpanElement | null => {
  if (typeof document === "undefined") {
    return null;
  }
  if (colorProbe && colorProbe.isConnected) {
    return colorProbe;
  }
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.position = "absolute";
  probe.style.pointerEvents = "none";
  probe.style.visibility = "hidden";
  probe.style.width = "0";
  probe.style.height = "0";
  probe.style.padding = "0";
  probe.style.margin = "0";
  const parent = document.body ?? document.documentElement;
  parent.appendChild(probe);
  colorProbe = probe;
  return colorProbe;
};

const normalizeColorForMermaid = (
  value: string | undefined,
  fallback: string
): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  if (STANDARD_COLOR_PATTERN.test(trimmed)) {
    return trimmed;
  }
  if (typeof document === "undefined") {
    return fallback;
  }
  const probe = ensureColorProbe();
  if (!probe) {
    return fallback;
  }
  probe.style.color = "";
  try {
    probe.style.color = trimmed;
    const computed = getComputedStyle(probe).color.trim();
    if (!computed || computed === "rgba(0, 0, 0, 0)") {
      return fallback;
    }
    if (!STANDARD_COLOR_PATTERN.test(computed)) {
      return fallback;
    }
    return computed;
  } catch {
    return fallback;
  }
};

const resolveColorVariable = (name: string, fallback: string): string => {
  const raw = readCssVariable(name);
  return normalizeColorForMermaid(raw, fallback);
};

const buildThemeVariables = (theme: ThemeMode): Record<string, string> => {
  const fallbacks = COLOR_FALLBACKS[theme];
  const font =
    readCssVariable("--font-inter") ??
    "Inter, -apple-system, BlinkMacSystemFont, sans-serif";

  const background = resolveColorVariable("--background", fallbacks.background);
  const foreground = resolveColorVariable("--foreground", fallbacks.foreground);
  const primary = resolveColorVariable("--primary", fallbacks.primary);
  const primaryForeground = resolveColorVariable(
    "--primary-foreground",
    fallbacks.primaryForeground
  );
  const border = resolveColorVariable("--border", fallbacks.border);
  const muted = resolveColorVariable("--muted", fallbacks.muted);
  const card = resolveColorVariable("--card", fallbacks.card);

  if (theme === "dark") {
    const surface = card;
    const secondarySurface = muted;

    return {
      background,
      fontFamily: font,
      primaryColor: surface,
      primaryTextColor: foreground,
      primaryBorderColor: border,
      secondaryColor: secondarySurface,
      secondaryTextColor: foreground,
      tertiaryColor: secondarySurface,
      lineColor: border,
      textColor: foreground,
      clusterBkg: secondarySurface,
      clusterBorder: border,
      edgeLabelBackground: surface,
      nodeTextColor: foreground,
      noteBkgColor: secondarySurface,
      noteTextColor: foreground,
    };
  }

  const sectionBackground = muted;

  return {
    background,
    fontFamily: font,
    primaryColor: primary,
    primaryTextColor: primaryForeground,
    primaryBorderColor: border,
    secondaryColor: sectionBackground,
    secondaryTextColor: foreground,
    tertiaryColor: sectionBackground,
    lineColor: border,
    textColor: foreground,
    clusterBkg: sectionBackground,
    clusterBorder: border,
    edgeLabelBackground: background,
    nodeTextColor: foreground,
    noteBkgColor: sectionBackground,
    noteTextColor: foreground,
  };
};

const createMermaidConfig = (theme: ThemeMode): MermaidConfig => {
  const themeVariables = buildThemeVariables(theme);
  return {
    startOnLoad: false,
    securityLevel: "loose",
    theme: theme === "dark" ? "dark" : "default",
    themeVariables,
  };
};

export const loadMermaid = (() => {
  let mermaidPromise: Promise<typeof import("mermaid")> | null = null;
  let currentTheme: ThemeMode | null = null;
  let currentConfigSignature: string | null = null;

  return async (themeOverride?: ThemeMode) => {
    const theme = resolveThemeMode(themeOverride);
    if (!mermaidPromise) {
      mermaidPromise = import("mermaid");
    }
    const mermaidModule = await mermaidPromise;
    const mermaid = mermaidModule.default;

    const config = createMermaidConfig(theme);
    const serializedConfig = JSON.stringify({
      theme: config.theme,
      vars: config.themeVariables,
    });
    if (currentTheme !== theme || currentConfigSignature !== serializedConfig) {
      mermaid.initialize(config);
      currentTheme = theme;
      currentConfigSignature = serializedConfig;
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
