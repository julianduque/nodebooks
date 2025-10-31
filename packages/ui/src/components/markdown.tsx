"use client";
import React from "react";
import type { ThemeMode } from "./theme.js";
import type { UiMarkdown } from "@nodebooks/notebook-schema";
import DOMPurify from "dompurify";
import { Marked, Renderer, type Tokens } from "marked";
import markedKatex from "marked-katex-extension";
import type mermaid from "mermaid";
import type { MermaidConfig } from "mermaid";
import {
  escapeHtml,
  highlightCode,
  normalizeLanguage,
} from "../lib/highlight.js";
import { useComponentThemeMode } from "./utils.js";

const markdownRenderer = new Marked({
  gfm: true,
  breaks: true,
});

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

markdownRenderer.use({ renderer });

markdownRenderer.use(
  markedKatex({
    throwOnError: false,
    output: "htmlAndMathml",
  })
);

const sanitizeSvg = (svg: string) =>
  typeof window === "undefined"
    ? svg
    : DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        ADD_TAGS: ["style", "foreignObject"],
        ADD_ATTR: ["style", "class", "xmlns", "xmlns:xlink", "xlink:href"],
      }).replace(/<\/?(html|body)[^>]*>/gi, "");

const resolveThemeMode = (override?: ThemeMode): ThemeMode => {
  if (override) {
    return override;
  }
  if (typeof document !== "undefined") {
    const declared = document.documentElement.dataset.theme;
    if (declared === "dark") {
      return "dark";
    }
    if (document.documentElement.classList.contains("dark")) {
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

const readComputedColor = (value: string): string | undefined => {
  if (STANDARD_COLOR_PATTERN.test(value)) {
    return value;
  }
  const probe = ensureColorProbe();
  if (!probe) return undefined;
  probe.style.color = value;
  const resolved = getComputedStyle(probe).color?.trim();
  if (!resolved || resolved === "rgba(0, 0, 0, 0)") {
    return undefined;
  }
  return STANDARD_COLOR_PATTERN.test(resolved) ? resolved : undefined;
};

const resolveColorToken = (token: `--${string}`, fallback: string): string => {
  const cssVar = readCssVariable(token);
  if (!cssVar) return fallback;
  return readComputedColor(cssVar) ?? fallback;
};

const buildThemeVariables = (theme: ThemeMode) => {
  const source = COLOR_FALLBACKS[theme];
  const background = resolveColorToken("--background", source.background);
  const foreground = resolveColorToken("--foreground", source.foreground);
  const border = resolveColorToken("--border", source.border);
  const muted = resolveColorToken("--muted", source.muted);
  const primary = resolveColorToken("--primary", source.primary);
  const primaryForeground = resolveColorToken(
    "--primary-foreground",
    source.primaryForeground
  );

  const sectionBackground = resolveColorToken(
    "--section",
    resolveColorToken("--card", source.card)
  );
  const sectionBorder = resolveColorToken("--section-border", border);
  const mutedForeground = resolveColorToken("--muted-foreground", foreground);

  return {
    background,
    foreground,
    primary,
    primaryBorderColor: border,
    primaryTextColor: primaryForeground,
    noteTextColor: foreground,
    noteBkgColor: sectionBackground,
    noteBorderColor: sectionBorder,
    tertiaryColor: muted,
    lineColor: border,
    fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
    labelTextColor: mutedForeground,
    loopTextColor: foreground,
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

const loadMermaid = (() => {
  type MermaidApi = typeof mermaid;
  let mermaidPromise: Promise<MermaidApi> | null = null;
  let currentTheme: ThemeMode | null = null;
  let currentConfigSignature: string | null = null;

  return async (themeOverride?: ThemeMode) => {
    const theme = resolveThemeMode(themeOverride);
    if (!mermaidPromise) {
      mermaidPromise = import("mermaid").then((module) => module.default);
    }
    const mermaidInstance = await mermaidPromise;

    const config = createMermaidConfig(theme);
    const serializedConfig = JSON.stringify({
      theme: config.theme,
      vars: config.themeVariables,
    });
    if (currentTheme !== theme || currentConfigSignature !== serializedConfig) {
      mermaidInstance.initialize(config);
      currentTheme = theme;
      currentConfigSignature = serializedConfig;
    }

    return mermaidInstance;
  };
})();

const waitNextTick = () =>
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

type MarkdownProps = Omit<UiMarkdown, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
export const Markdown: React.FC<MarkdownProps> = ({
  markdown,
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const instanceId = React.useId();
  const renderPrefix = React.useMemo(() => {
    const normalized = instanceId.replace(/[^a-zA-Z0-9_-]/g, "");
    return normalized.length > 0 ? `ui-mermaid-${normalized}` : "ui-mermaid";
  }, [instanceId]);
  const cacheRef = React.useRef<Map<string, string>>(new Map()).current;
  const previewRef = React.useRef<HTMLDivElement | null>(null);
  const html = React.useMemo(
    () => markdownRenderer.parse(markdown ?? "", { async: false }),
    [markdown]
  );
  const rawHtml = React.useMemo(() => String(html), [html]);
  const sanitizedHtml = React.useMemo(() => {
    if (typeof window === "undefined") {
      return rawHtml;
    }
    return DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: [
        "style",
        "data-definition",
        "data-rendered-definition",
        "data-processed",
        "data-theme",
      ],
    });
  }, [rawHtml]);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  const renderedHtml = hydrated ? sanitizedHtml : rawHtml;

  React.useEffect(() => {
    if (!hydrated) return;
    const container = previewRef.current;
    if (!container) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const renderMermaidBlocks = async () => {
      if (cancelled) return;
      observer?.disconnect();

      await waitNextTick();
      if (cancelled) return;

      const blocks = Array.from(
        container.querySelectorAll<HTMLElement>("pre.mermaid")
      );
      if (blocks.length === 0) {
        if (!cancelled) {
          observer?.observe(container, { childList: true, subtree: true });
        }
        return;
      }

      const mermaid = await loadMermaid(mode);
      let index = 0;

      for (const block of blocks) {
        if (cancelled) break;

        const definitionAttr = block.dataset.definition ?? "";
        const definition = definitionAttr
          ? decodeURIComponent(definitionAttr)
          : (block.textContent ?? "");
        if (!definition) continue;

        const cacheKey = `${renderPrefix}::${mode}::${definition}`;
        const cached = cacheRef.get(cacheKey);
        if (cached) {
          block.innerHTML = cached;
          block.setAttribute("data-processed", "1");
          block.setAttribute("data-rendered-definition", definition);
          block.setAttribute("data-theme", mode);
          continue;
        }

        try {
          const { svg } = await mermaid.render(
            `${renderPrefix}-${index++}`,
            definition
          );
          if (cancelled || !container.contains(block)) continue;
          const sanitized = sanitizeSvg(svg);
          cacheRef.set(cacheKey, sanitized);
          block.innerHTML = sanitized;
          block.setAttribute("data-processed", "1");
          block.setAttribute("data-rendered-definition", definition);
          block.setAttribute("data-theme", mode);
        } catch (error) {
          if (cancelled || !container.contains(block)) continue;
          block.classList.add("mermaid-error");
          block.textContent =
            error instanceof Error ? error.message : String(error);
          block.setAttribute("data-processed", "1");
          block.removeAttribute("data-rendered-definition");
          block.setAttribute("data-theme", mode);
          cacheRef.delete(cacheKey);
        }
      }

      if (!cancelled) {
        observer?.observe(container, { childList: true, subtree: true });
      }
    };

    observer = new MutationObserver(() => {
      void renderMermaidBlocks();
    });

    void renderMermaidBlocks();

    return () => {
      cancelled = true;
      observer?.disconnect();
      observer = null;
    };
  }, [cacheRef, hydrated, mode, renderedHtml]);

  return (
    <div className={`relative ${className ?? ""}`} data-theme-mode={mode}>
      <div
        className="markdown-preview p-2 text-foreground"
        ref={previewRef}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
};
