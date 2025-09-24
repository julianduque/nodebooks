"use client";
import React from "react";
import { UiThemeContext } from "./theme";
import type { UiSpinner } from "@nodebooks/notebook-schema";
import { Loader2 } from "lucide-react";

type SpinnerProps = Omit<UiSpinner, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
export const Spinner: React.FC<SpinnerProps> = ({
  label,
  size = "md",
  className,
  themeMode,
}) => {
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  const px =
    typeof size === "number"
      ? size
      : size === "sm"
        ? 16
        : size === "lg"
          ? 32
          : 20;
  return (
    <div
      className={`relative inline-flex items-center gap-2 ${className ?? ""}`}
    >
      <Loader2
        size={px}
        className={
          mode === "light"
            ? "animate-spin text-slate-600"
            : "animate-spin text-slate-100"
        }
      />
      {label && (
        <span
          className={
            mode === "light"
              ? "text-xs text-slate-600"
              : "text-xs text-slate-100"
          }
        >
          {label}
        </span>
      )}
    </div>
  );
};
