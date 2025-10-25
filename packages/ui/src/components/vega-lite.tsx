"use client";

import React from "react";
import type { UiVegaLite } from "@nodebooks/notebook-schema";
import { useComponentThemeMode } from "./utils";

export type VegaLiteProps = Omit<UiVegaLite, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};

export const VegaLiteChart: React.FC<VegaLiteProps> = ({
  spec,
  width,
  height,
  renderer = "canvas",
  actions = false,
  className,
  themeMode,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mode = useComponentThemeMode(themeMode);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let view: { finalize: () => void } | null = null;

    const mount = async () => {
      try {
        const embedModule = await import("vega-embed");
        const embed = embedModule.default ?? embedModule;
        if (!containerRef.current) return;
        const mergedSpec: Record<string, unknown> = {
          ...(spec as Record<string, unknown>),
        };
        if (typeof width === "number") mergedSpec.width = width;
        if (typeof height === "number") mergedSpec.height = height;
        const result = await embed(containerRef.current, mergedSpec, {
          renderer,
          actions,
        });
        view = result.view;
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : typeof err === "string"
                ? err
                : "Unknown Vega-Lite error"
          );
        }
      }
    };

    mount();

    return () => {
      cancelled = true;
      try {
        view?.finalize();
      } catch {
        /* ignore */
      }
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [spec, width, height, renderer, actions]);

  return (
    <div
      className={`rounded-md border p-3 text-sm ${className ?? ""} ${
        mode === "light"
          ? "border-slate-200 bg-slate-100"
          : "border-slate-800 bg-slate-900"
      }`}
    >
      {error ? (
        <div className="text-red-500">
          Failed to render Vega-Lite chart: {error}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden"
          style={{ minHeight: height ? `${height}px` : "240px" }}
        />
      )}
    </div>
  );
};
