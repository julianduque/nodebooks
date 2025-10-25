"use client";

import { useEffect, useRef } from "react";
import {
  loadMermaid,
  sanitizeSvg,
  waitNextTick,
} from "@/components/notebook/markdown-preview-utils";
import type { ThemeMode } from "@/components/theme-context";

interface MermaidRendererArgs {
  cellId: string;
  html: string;
  theme: ThemeMode;
}

export const useMermaidRenderer = ({
  cellId,
  html,
  theme,
}: MermaidRendererArgs) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const renderMermaid = async () => {
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
      const mermaid = await loadMermaid(theme);
      let index = 0;
      for (const block of blocks) {
        if (cancelled) break;
        const definitionAttr = block.dataset.definition ?? "";
        const definition = definitionAttr
          ? decodeURIComponent(definitionAttr)
          : (block.textContent ?? "");
        if (!definition) continue;
        const cacheKey = `${theme}::${cellId}::${definition}`;
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          block.innerHTML = cached;
          block.setAttribute("data-processed", "1");
          block.setAttribute("data-rendered-definition", definition);
          continue;
        }
        try {
          const { svg } = await mermaid.render(
            `publish-mermaid-${cellId}-${index++}`,
            definition
          );
          if (cancelled || !container.contains(block)) continue;
          const sanitized = sanitizeSvg(svg);
          cacheRef.current.set(cacheKey, sanitized);
          block.innerHTML = sanitized;
          block.setAttribute("data-processed", "1");
          block.setAttribute("data-rendered-definition", definition);
        } catch (error) {
          if (cancelled || !container.contains(block)) continue;
          block.classList.add("mermaid-error");
          block.textContent =
            error instanceof Error ? error.message : String(error);
          block.setAttribute("data-processed", "1");
          block.removeAttribute("data-rendered-definition");
          cacheRef.current.delete(cacheKey);
        }
      }
      if (!cancelled) {
        observer?.observe(container, { childList: true, subtree: true });
      }
    };

    observer = new MutationObserver(() => {
      void renderMermaid();
    });
    void renderMermaid();

    return () => {
      cancelled = true;
      observer?.disconnect();
      observer = null;
    };
  }, [cellId, html, theme]);

  return containerRef;
};
