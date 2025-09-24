"use client";
import React from "react";
import { UiThemeContext } from "./theme";
import type { UiBadge } from "@nodebooks/notebook-schema";

type BadgeProps = Omit<UiBadge, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
const badgeColor = (mode: "light" | "dark", c?: UiBadge["color"]) => {
  if (mode === "dark") {
    switch (c) {
      case "info":
        return "bg-sky-600 text-white border-sky-400";
      case "success":
        return "bg-emerald-600 text-white border-emerald-400";
      case "warn":
        return "bg-amber-600 text-white border-amber-400";
      case "error":
        return "bg-rose-600 text-white border-rose-400";
      default:
        return "bg-slate-600 text-white border-slate-400";
    }
  }
  switch (c) {
    case "info":
      return "bg-sky-100 text-sky-800 border-sky-300";
    case "success":
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    case "warn":
      return "bg-amber-100 text-amber-900 border-amber-300";
    case "error":
      return "bg-rose-100 text-rose-800 border-rose-300";
    default:
      return "bg-slate-100 text-slate-800 border-slate-300";
  }
};

export const BadgeTag: React.FC<BadgeProps> = ({
  text,
  color,
  className,
  themeMode,
}) => {
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  return (
    <span className={`relative inline-flex items-center ${className ?? ""}`}>
      <span
        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-semibold ${badgeColor(
          mode,
          color
        )}`}
      >
        {text}
      </span>
    </span>
  );
};
