import React from "react";
import type { UiSpinner } from "@nodebooks/notebook-schema";

type SpinnerProps = UiSpinner & { className?: string };
export const Spinner: React.FC<SpinnerProps> = ({
  label,
  size = "md",
  className,
}) => {
  const px =
    typeof size === "number"
      ? size
      : size === "sm"
        ? 16
        : size === "lg"
          ? 32
          : 20;
  return (
    <div className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <svg
        width={px}
        height={px}
        viewBox="0 0 24 24"
        className="animate-spin text-slate-300"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
      {label && <span className="text-xs text-slate-300">{label}</span>}
    </div>
  );
};
