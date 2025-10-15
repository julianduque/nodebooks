"use client";

import React from "react";
import type { UiHeatmap } from "@nodebooks/notebook-schema";
import { UiThemeContext } from "./theme";
import { sampleColor, getPalette } from "./color-scales";

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
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  const rows = values.length;
  const cols = values[0]?.length ?? 0;
  const isEmpty = rows === 0 || cols === 0;
  const { min: minValue, max: maxValue } = React.useMemo(
    () => computeExtent(values, { min, max }),
    [values, min, max]
  );

  const cellSize = cols > 20 || rows > 20 ? 18 : 26;
  const marginLeft = yLabels && yLabels.length > 0 ? 90 : 24;
  const marginTop = 24;
  const marginRight = 24;
  const marginBottom = xLabels && xLabels.length > 0 ? 60 : 24;
  const legendHeight = legend ? 36 : 0;
  const width = marginLeft + cols * cellSize + marginRight;
  const height = marginTop + rows * cellSize + marginBottom + legendHeight;

  const getColor = React.useCallback(
    (value: number) => {
      const ratio = (value - minValue) / (maxValue - minValue);
      return sampleColor(colorScale, Number.isFinite(ratio) ? ratio : 0.5);
    },
    [colorScale, minValue, maxValue]
  );

  const palette = React.useMemo(() => getPalette(colorScale), [colorScale]);

  if (isEmpty) {
    return (
      <div
        className={`rounded-md border p-3 text-sm ${className ?? ""} ${
          mode === "light"
            ? "border-slate-200 bg-slate-100 text-slate-500"
            : "border-slate-800 bg-slate-900 text-slate-300"
        }`}
      >
        Heatmap has no data.
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border p-3 text-sm ${className ?? ""} ${
        mode === "light"
          ? "border-slate-200 bg-slate-100"
          : "border-slate-800 bg-slate-900"
      }`}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Heatmap visualization"
      >
        <rect x={0} y={0} width={width} height={height} fill="none" />
        {values.map((row: number[], rowIdx: number) =>
          row.map((value: number, colIdx: number) => {
            const x = marginLeft + colIdx * cellSize;
            const y = marginTop + rowIdx * cellSize;
            const color = getColor(value);
            const textColor = mode === "light" ? "#0f172a" : "#f8fafc";
            return (
              <g key={`${rowIdx}-${colIdx}`}>
                <rect
                  x={x}
                  y={y}
                  width={cellSize - 1}
                  height={cellSize - 1}
                  rx={4}
                  fill={color}
                />
                <text
                  x={x + cellSize / 2 - 0.5}
                  y={y + cellSize / 2 + 4 / 2}
                  textAnchor="middle"
                  fontSize={Math.max(10, cellSize / 2.4)}
                  fill={textColor}
                  opacity={0.85}
                >
                  {Number.isFinite(value) ? value.toFixed(1) : "–"}
                </text>
              </g>
            );
          })
        )}

        {yLabels?.map((label: string, idx: number) => (
          <text
            key={`y-${idx}`}
            x={marginLeft - 10}
            y={marginTop + idx * cellSize + cellSize / 2 + 4 / 2}
            textAnchor="end"
            fontSize={12}
            fill={mode === "light" ? "#475569" : "#cbd5f5"}
          >
            {label}
          </text>
        ))}

        {xLabels?.map((label: string, idx: number) => (
          <text
            key={`x-${idx}`}
            x={marginLeft + idx * cellSize + cellSize / 2}
            y={marginTop + rows * cellSize + 18}
            textAnchor="end"
            fontSize={12}
            transform={`rotate(-45 ${marginLeft + idx * cellSize + cellSize / 2} ${
              marginTop + rows * cellSize + 18
            })`}
            fill={mode === "light" ? "#475569" : "#cbd5f5"}
          >
            {label}
          </text>
        ))}

        {legend && (
          <g
            transform={`translate(${marginLeft}, ${marginTop + rows * cellSize + marginBottom - 12})`}
          >
            {palette.map((color: string, idx: number) => (
              <rect
                key={color}
                x={(idx * cols * cellSize) / palette.length}
                y={0}
                width={(cols * cellSize) / palette.length}
                height={10}
                fill={color}
              />
            ))}
            <text
              x={0}
              y={24}
              fontSize={11}
              fill={mode === "light" ? "#475569" : "#cbd5f5"}
            >
              {minValue.toFixed(2)}
            </text>
            <text
              x={cols * cellSize}
              y={24}
              fontSize={11}
              textAnchor="end"
              fill={mode === "light" ? "#475569" : "#cbd5f5"}
            >
              {maxValue.toFixed(2)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
