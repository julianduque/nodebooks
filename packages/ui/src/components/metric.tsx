"use client";
import React from "react";
import type { UiMetric } from "@nodebooks/notebook-schema";
import { useComponentThemeMode } from "./utils";

type MetricProps = Omit<UiMetric, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
export const MetricTile: React.FC<MetricProps> = ({
  label,
  value,
  unit,
  delta,
  helpText,
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const deltaNum = typeof delta === "number" ? delta : undefined;
  const deltaColor =
    deltaNum === undefined
      ? mode === "light"
        ? "text-slate-500"
        : "text-slate-500"
      : deltaNum > 0
        ? "text-emerald-500"
        : deltaNum < 0
          ? "text-rose-500"
          : mode === "light"
            ? "text-slate-500"
            : "text-slate-500";
  const deltaSign =
    deltaNum === undefined ? "" : deltaNum > 0 ? "▲" : deltaNum < 0 ? "▼" : "→";
  return (
    <div
      className={`relative rounded-lg border p-3 ${className ?? ""} ${mode === "light" ? "border-slate-200 bg-slate-100" : "border-slate-800 bg-slate-900"}`}
    >
      {label && (
        <div
          className={
            mode === "light"
              ? "text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
              : "text-xs font-semibold uppercase tracking-[0.2em] text-slate-500"
          }
        >
          {label}
        </div>
      )}
      <div className="mt-1 flex items-baseline gap-2">
        <div
          className={
            mode === "light"
              ? "text-3xl font-bold text-slate-800"
              : "text-3xl font-bold text-slate-100"
          }
        >
          {String(value)}
          {unit ? (
            <span
              className={
                mode === "light"
                  ? "ml-1 text-base text-slate-500"
                  : "ml-1 text-base text-slate-400"
              }
            >
              {unit}
            </span>
          ) : null}
        </div>
        {deltaNum !== undefined && (
          <div className={`text-sm ${deltaColor}`}>
            {deltaSign} {Math.abs(deltaNum)}
          </div>
        )}
      </div>
      {helpText && (
        <div
          className={
            mode === "light"
              ? "mt-1 text-xs text-slate-600"
              : "mt-1 text-xs text-slate-400"
          }
        >
          {helpText}
        </div>
      )}
    </div>
  );
};
