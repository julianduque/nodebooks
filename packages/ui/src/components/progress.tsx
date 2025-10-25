"use client";
import React from "react";
import type { UiProgress } from "@nodebooks/notebook-schema";
import { useComponentThemeMode } from "./utils";

type ProgressProps = Omit<UiProgress, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
export const ProgressBar: React.FC<ProgressProps> = ({
  label,
  value,
  max = 100,
  indeterminate,
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const pct =
    typeof value === "number" && max > 0
      ? Math.max(0, Math.min(100, (value / max) * 100))
      : undefined;
  return (
    <div className={`relative ${className ?? ""}`}>
      {label && (
        <div
          className={
            mode === "light"
              ? "mb-1 text-xs text-slate-600"
              : "mb-1 text-xs text-slate-100"
          }
        >
          {label}
        </div>
      )}
      <div
        className={`relative h-3 w-full overflow-hidden rounded-full ${
          mode === "light" ? "bg-slate-200" : "bg-slate-100"
        }`}
        role="progressbar"
        aria-busy={indeterminate || undefined}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={indeterminate ? undefined : value}
      >
        {!indeterminate && (
          <div
            className={`h-full rounded-full transition-[width] duration-300 ease-out`}
            style={{
              width: `${pct ?? 0}%`,
              background:
                "linear-gradient(to right, var(--primary), color-mix(in oklch, var(--primary), black 12%))",
            }}
          />
        )}
        {indeterminate && (
          <>
            <div
              className={
                mode === "light"
                  ? "absolute inset-0 bg-slate-300/40"
                  : "absolute inset-0 bg-slate-600/40"
              }
            />
            <div
              className="absolute inset-y-0 left-0 z-[1] w-1/3 rounded-full"
              style={{
                background:
                  "linear-gradient(to right, color-mix(in oklch, var(--primary), white 30%), var(--primary))",
                animation: "nbIndeterminate 1.2s linear infinite",
              }}
            />
          </>
        )}
      </div>
      {typeof value === "number" && !indeterminate && (
        <div
          className={
            mode === "light"
              ? "mt-1 text-right text-xs text-slate-600"
              : "mt-1 text-right text-xs text-slate-100"
          }
        >
          {Math.round(pct ?? 0)}%
        </div>
      )}
    </div>
  );
};
