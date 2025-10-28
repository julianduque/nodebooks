"use client";

import React from "react";
import type { UiPlotly } from "@nodebooks/notebook-schema";
import { useComponentThemeMode } from "./utils";

type PlotlyModule = {
  react: (
    el: HTMLElement,
    data: unknown,
    layout?: unknown,
    config?: unknown
  ) => Promise<unknown> | unknown;
  purge: (el: HTMLElement) => void;
  toImage: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<string>;
};

export type PlotlyChartProps = Omit<UiPlotly, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
  onReady?: (handle: { element: HTMLElement; plotly: PlotlyModule }) => void;
};

export const PlotlyChart: React.FC<PlotlyChartProps> = ({
  data,
  layout,
  config,
  responsive = true,
  className,
  themeMode,
  onReady,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mode = useComponentThemeMode(themeMode);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    let plotly: PlotlyModule | null = null;

    const render = async () => {
      try {
        const mod = await import("plotly.js-dist-min");
        const resolved = (mod as { default?: PlotlyModule })?.default;
        plotly = resolved ?? (mod as unknown as PlotlyModule);
        if (!mounted || !containerRef.current) return;
        const layoutWithTheme = {
          ...(layout as Record<string, unknown> | undefined),
          template:
            mode === "dark"
              ? {
                  layout: {
                    paper_bgcolor: "#0f172a",
                    plot_bgcolor: "#0f172a",
                    font: { color: "#e2e8f0" },
                  },
                }
              : {
                  layout: {
                    paper_bgcolor: "#ffffff",
                    plot_bgcolor: "#ffffff",
                    font: { color: "#0f172a" },
                  },
                },
        };
        await plotly.react(
          containerRef.current,
          data as unknown,
          layoutWithTheme as unknown,
          {
            displaylogo: false,
            responsive,
            willReadFrequently: true,
            ...(config as Record<string, unknown> | undefined),
          } as unknown
        );
        if (mounted) setError(null);
        if (mounted && containerRef.current && typeof onReady === "function") {
          onReady({ element: containerRef.current, plotly });
        }
      } catch (err) {
        if (!mounted) return;
        setError(
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Unknown Plotly error"
        );
      }
    };

    render();

    return () => {
      mounted = false;
      if (plotly && containerRef.current) {
        try {
          plotly.purge(containerRef.current);
        } catch {
          /* ignore */
        }
      }
    };
  }, [data, layout, config, responsive, mode, onReady]);

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
          Failed to render Plotly chart: {error}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="relative w-full"
          style={{ minHeight: "280px" }}
        />
      )}
    </div>
  );
};
