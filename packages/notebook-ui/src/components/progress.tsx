import React from "react";
import type { UiProgress } from "@nodebooks/notebook-schema";

type ProgressProps = UiProgress & { className?: string };
export const ProgressBar: React.FC<ProgressProps> = ({
  label,
  value,
  max = 100,
  indeterminate,
  className,
}) => {
  const pct =
    typeof value === "number" && max > 0
      ? Math.max(0, Math.min(100, (value / max) * 100))
      : undefined;
  return (
    <div className={className}>
      {label && <div className="mb-1 text-xs text-slate-600">{label}</div>}
      <div className="h-2 w-full rounded bg-slate-200">
        <div
          className={`h-full rounded bg-brand-600 ${indeterminate ? "animate-pulse" : ""}`}
          style={{ width: indeterminate ? "40%" : `${pct ?? 0}%` }}
        />
      </div>
      {typeof value === "number" && !indeterminate && (
        <div className="mt-1 text-right text-xs text-slate-600">
          {Math.round(pct ?? 0)}%
        </div>
      )}
    </div>
  );
};
