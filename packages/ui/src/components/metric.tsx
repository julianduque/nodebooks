"use client";
import React from "react";
import type { UiMetric } from "@nodebooks/notebook-schema";
import { useComponentThemeMode } from "./utils.js";
import clsx from "clsx";

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
      ? "text-muted-foreground"
      : deltaNum > 0
        ? "text-primary"
        : deltaNum < 0
          ? "text-[color:var(--destructive)]"
          : "text-muted-foreground";
  const deltaSign =
    deltaNum === undefined ? "" : deltaNum > 0 ? "▲" : deltaNum < 0 ? "▼" : "→";
  return (
    <div
      data-theme-mode={mode}
      className={clsx(
        "relative rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm",
        className
      )}
    >
      {label && (
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </div>
      )}
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-3xl font-bold text-card-foreground">
          {String(value)}
          {unit ? (
            <span className="ml-1 text-base text-muted-foreground">{unit}</span>
          ) : null}
        </div>
        {deltaNum !== undefined && (
          <div className={`text-sm ${deltaColor}`}>
            {deltaSign} {Math.abs(deltaNum)}
          </div>
        )}
      </div>
      {helpText && (
        <div className="mt-1 text-xs text-muted-foreground">{helpText}</div>
      )}
    </div>
  );
};
