"use client";

import React from "react";
import type { UiHeatmap } from "@nodebooks/notebook-schema";
import { sampleColor, sampleColorRgb, getPalette } from "./color-scales";
import { useComponentThemeMode } from "./utils";

export type HeatmapProps = Omit<UiHeatmap, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};

const computeExtent = (
  values: number[][],
  provided?: { min?: number; max?: number }
) => {
  let min = provided?.min ?? Number.POSITIVE_INFINITY;
  let max = provided?.max ?? Number.NEGATIVE_INFINITY;
  if (provided?.min !== undefined && provided?.max !== undefined) {
    return { min: provided.min, max: provided.max };
  }
  for (const row of values) {
    for (const v of row) {
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 1;
  }
  if (min === max) {
    max = min + 1;
  }
  return { min, max };
};

const clamp = (value: number, minValue: number, maxValue: number) =>
  Math.min(Math.max(value, minValue), maxValue);

const formatValue = (value: number) => {
  if (!Number.isFinite(value)) return "–";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  if (abs >= 100) {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    });
  }
  if (abs >= 1) {
    return value.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  }
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0,
  });
};

const computeCellSize = (rows: number, cols: number) => {
  const largest = Math.max(rows, cols);
  if (largest >= 40) return 26;
  if (largest >= 28) return 32;
  if (largest >= 18) return 40;
  if (largest >= 10) return 48;
  return 56;
};

const buildGradientStops = (palette: string[]) => {
  if (palette.length === 0) return "var(--muted)";
  if (palette.length === 1) return palette[0];
  const denom = palette.length - 1;
  return palette
    .map((color, index) => `${color} ${(index / denom) * 100}%`)
    .join(", ");
};

export const HeatmapMatrix: React.FC<HeatmapProps> = ({
  values,
  xLabels,
  yLabels,
  colorScale = "viridis",
  min,
  max,
  legend = true,
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const themeVars = React.useMemo<React.CSSProperties>(() => {
    if (mode === "dark") {
      return {
        "--heatmap-card-bg": "rgba(15, 23, 42, 0.92)",
        "--heatmap-card-border": "rgba(148, 163, 184, 0.28)",
        "--heatmap-surface-bg": "rgba(15, 23, 42, 0.76)",
        "--heatmap-surface-border": "rgba(148, 163, 184, 0.24)",
        "--heatmap-label-bg": "rgba(30, 41, 59, 0.82)",
        "--heatmap-label-text": "rgba(226, 232, 240, 0.92)",
        "--heatmap-empty-text": "rgba(148, 163, 184, 0.8)",
        "--heatmap-legend-text": "rgba(203, 213, 225, 0.85)",
        "--heatmap-ring-color": "rgba(148, 163, 184, 0.32)",
        "--heatmap-grid-overlay": "rgba(255, 255, 255, 0.18)",
        "--heatmap-text-primary": "rgba(226, 232, 240, 0.94)",
      } as React.CSSProperties;
    }
    return {
      "--heatmap-card-bg": "rgba(255, 255, 255, 0.96)",
      "--heatmap-card-border": "rgba(226, 232, 240, 0.9)",
      "--heatmap-surface-bg": "rgba(248, 250, 252, 0.94)",
      "--heatmap-surface-border": "rgba(226, 232, 240, 0.72)",
      "--heatmap-label-bg": "rgba(255, 255, 255, 0.94)",
      "--heatmap-label-text": "rgba(71, 85, 105, 0.92)",
      "--heatmap-empty-text": "rgba(100, 116, 139, 0.82)",
      "--heatmap-legend-text": "rgba(71, 85, 105, 0.8)",
      "--heatmap-ring-color": "rgba(15, 23, 42, 0.08)",
      "--heatmap-grid-overlay": "rgba(255, 255, 255, 0.35)",
      "--heatmap-text-primary": "rgba(30, 41, 59, 0.95)",
    } as React.CSSProperties;
  }, [mode]);
  const rows = values.length;
  const cols = React.useMemo(() => {
    if (values.length === 0) return 0;
    return values.reduce((maxCols, row) => Math.max(maxCols, row.length), 0);
  }, [values]);
  const isEmpty = rows === 0 || cols === 0;
  const { min: minValue, max: maxValue } = React.useMemo(
    () => computeExtent(values, { min, max }),
    [values, min, max]
  );

  const palette = React.useMemo(() => getPalette(colorScale), [colorScale]);
  const span = Math.max(maxValue - minValue, Number.EPSILON);
  const cellSize = React.useMemo(
    () => computeCellSize(rows, cols),
    [rows, cols]
  );
  const showValues = rows * cols <= 400;
  const showXLabels = Array.isArray(xLabels) && xLabels.length >= cols;
  const showYLabels = Array.isArray(yLabels) && yLabels.length >= rows;
  const gradientStops = React.useMemo(
    () => buildGradientStops(palette),
    [palette]
  );

  const getCellVisuals = React.useCallback(
    (value: number) => {
      const ratio = Number.isFinite(value)
        ? clamp((value - minValue) / span, 0, 1)
        : 0.5;
      const fill = sampleColor(colorScale, ratio);
      const [r, g, b] = sampleColorRgb(colorScale, ratio);
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const textColor =
        luminance > 0.6
          ? "rgba(15, 23, 42, 0.88)"
          : "rgba(248, 250, 252, 0.92)";
      return { fill, textColor };
    },
    [colorScale, minValue, span]
  );

  if (isEmpty) {
    return (
      <div
        className={`w-full rounded-xl border p-4 text-sm shadow-sm ${className ?? ""}`}
        style={{
          ...themeVars,
          backgroundColor: "var(--heatmap-card-bg)",
          borderColor: "var(--heatmap-card-border)",
          color: "var(--heatmap-empty-text)",
        }}
      >
        Heatmap has no data.
      </div>
    );
  }

  const templateColumns = `${showYLabels ? "max-content " : ""}repeat(${cols}, ${cellSize}px)`;
  const templateRows = `${showXLabels ? "max-content " : ""}repeat(${rows}, ${cellSize}px)`;

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border p-4 text-sm shadow-sm ${
        className ?? ""
      }`}
      role="group"
      aria-label="Heatmap visualization"
      style={{
        ...themeVars,
        backgroundColor: "var(--heatmap-card-bg)",
        borderColor: "var(--heatmap-card-border)",
        color: "var(--heatmap-text-primary)",
      }}
    >
      <div
        className="relative max-h-[520px] w-full overflow-auto rounded-lg border"
        style={{
          backgroundColor: "var(--heatmap-surface-bg)",
          borderColor: "var(--heatmap-surface-border)",
        }}
      >
        <div
          className="grid min-w-max gap-2 p-2"
          role="grid"
          style={{
            gridTemplateColumns: templateColumns,
            gridTemplateRows: templateRows,
          }}
        >
          {showXLabels ? (
            <>
              {showYLabels ? (
                <div
                  aria-hidden="true"
                  className="sticky top-0 left-0 z-30 h-full w-full rounded-md backdrop-blur"
                  style={{
                    backgroundColor: "var(--heatmap-label-bg)",
                    borderColor: "var(--heatmap-surface-border)",
                  }}
                />
              ) : null}
              {Array.from({ length: cols }).map((_, colIdx) => (
                <div
                  key={`x-label-${colIdx}`}
                  role="columnheader"
                  aria-colindex={colIdx + 1}
                  className="sticky top-0 z-20 flex h-full items-center justify-center rounded-md px-3 py-2 text-xs font-medium shadow-sm backdrop-blur"
                  style={{
                    backgroundColor: "var(--heatmap-label-bg)",
                    color: "var(--heatmap-label-text)",
                  }}
                >
                  <span className="max-w-[8rem] truncate">
                    {xLabels?.[colIdx] ?? `Column ${colIdx + 1}`}
                  </span>
                </div>
              ))}
            </>
          ) : null}

          {values.map((row, rowIdx) => (
            <React.Fragment key={`row-${rowIdx}`}>
              {showYLabels ? (
                <div
                  role="rowheader"
                  aria-rowindex={rowIdx + 1}
                  className="sticky left-0 z-20 flex h-full items-center justify-end rounded-md px-3 py-2 text-xs font-medium shadow-sm backdrop-blur"
                  style={{
                    backgroundColor: "var(--heatmap-label-bg)",
                    color: "var(--heatmap-label-text)",
                  }}
                >
                  <span className="max-w-[7rem] truncate text-right">
                    {yLabels?.[rowIdx] ?? `Row ${rowIdx + 1}`}
                  </span>
                </div>
              ) : null}
              {Array.from({ length: cols }).map((_, colIdx) => {
                const rawValue = row?.[colIdx];
                const value = Number.isFinite(rawValue as number)
                  ? (rawValue as number)
                  : Number(rawValue);
                const { fill, textColor } = getCellVisuals(value);
                const formatted = formatValue(value);
                const titleParts = [yLabels?.[rowIdx], xLabels?.[colIdx]]
                  .filter(Boolean)
                  .join(" • ");
                return (
                  <div
                    key={`cell-${rowIdx}-${colIdx}`}
                    role="gridcell"
                    aria-rowindex={rowIdx + 1}
                    aria-colindex={colIdx + 1}
                    className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg ring-1 ring-inset transition-transform duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md"
                    style={
                      {
                        backgroundColor: fill,
                        minWidth: cellSize,
                        minHeight: cellSize,
                        "--tw-ring-color": "var(--heatmap-ring-color)",
                      } as React.CSSProperties
                    }
                    title={
                      titleParts ? `${titleParts}: ${formatted}` : formatted
                    }
                  >
                    {showValues ? (
                      <span
                        className="text-xs font-semibold tracking-tight"
                        style={{ color: textColor }}
                      >
                        {formatted}
                      </span>
                    ) : null}
                    <span
                      className="pointer-events-none absolute inset-0 rounded-lg border opacity-0 transition-opacity group-hover:opacity-60"
                      style={{ borderColor: "var(--heatmap-grid-overlay)" }}
                    />
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      {legend ? (
        <div className="mt-4 space-y-2">
          <div
            className="h-2 w-full rounded-full shadow-inner"
            style={{
              backgroundImage: `linear-gradient(90deg, ${gradientStops})`,
            }}
            aria-hidden="true"
          />
          <div
            className="flex items-center justify-between text-[0.75rem]"
            style={{ color: "var(--heatmap-legend-text)" }}
          >
            <span>{formatValue(minValue)}</span>
            <span>{formatValue(maxValue)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};
