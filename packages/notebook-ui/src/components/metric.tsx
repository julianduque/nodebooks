import React from "react";
import type { UiMetric } from "@nodebooks/notebook-schema";

type MetricProps = UiMetric & { className?: string };
export const MetricTile: React.FC<MetricProps> = ({
  label,
  value,
  unit,
  delta,
  helpText,
  className,
}) => {
  const deltaNum = typeof delta === "number" ? delta : undefined;
  const deltaColor =
    deltaNum === undefined
      ? "text-slate-400"
      : deltaNum > 0
        ? "text-emerald-500"
        : deltaNum < 0
          ? "text-rose-500"
          : "text-slate-400";
  const deltaSign =
    deltaNum === undefined ? "" : deltaNum > 0 ? "▲" : deltaNum < 0 ? "▼" : "→";
  return (
    <div
      className={`rounded-lg border border-slate-700 bg-slate-900/30 p-3 ${className ?? ""}`}
    >
      {label && (
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          {label}
        </div>
      )}
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-3xl font-bold text-slate-100">
          {String(value)}
          {unit ? (
            <span className="ml-1 text-base text-slate-300">{unit}</span>
          ) : null}
        </div>
        {deltaNum !== undefined && (
          <div className={`text-sm ${deltaColor}`}>
            {deltaSign} {Math.abs(deltaNum)}
          </div>
        )}
      </div>
      {helpText && (
        <div className="mt-1 text-xs text-slate-400">{helpText}</div>
      )}
    </div>
  );
};
