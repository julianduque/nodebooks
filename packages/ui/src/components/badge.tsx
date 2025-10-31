"use client";
import React from "react";
import type { UiBadge } from "@nodebooks/notebook-schema";
import { useComponentThemeMode } from "./utils.js";
import clsx from "clsx";
import type { CSSProperties } from "react";

type BadgeToneVars = CSSProperties & {
  "--nb-badge-bg"?: string;
  "--nb-badge-border"?: string;
  "--nb-badge-fg"?: string;
};

type BadgeProps = Omit<UiBadge, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
const badgeToneVars: Record<
  NonNullable<UiBadge["color"]> | "default",
  BadgeToneVars
> = {
  default: {
    "--nb-badge-bg": "color-mix(in oklch, var(--muted) 45%, transparent)",
    "--nb-badge-border": "color-mix(in oklch, var(--border) 80%, transparent)",
    "--nb-badge-fg": "var(--foreground)",
  },
  neutral: {
    "--nb-badge-bg": "color-mix(in oklch, var(--muted) 45%, transparent)",
    "--nb-badge-border": "color-mix(in oklch, var(--border) 80%, transparent)",
    "--nb-badge-fg": "var(--foreground)",
  },
  info: {
    "--nb-badge-bg":
      "color-mix(in oklch, var(--chart-2, #38bdf8) 30%, var(--background))",
    "--nb-badge-border":
      "color-mix(in oklch, var(--chart-2, #38bdf8) 65%, transparent)",
    "--nb-badge-fg":
      "color-mix(in oklch, var(--chart-2, #38bdf8) 80%, var(--foreground))",
  },
  success: {
    "--nb-badge-bg":
      "color-mix(in oklch, var(--primary) 25%, var(--background))",
    "--nb-badge-border": "color-mix(in oklch, var(--primary) 70%, transparent)",
    "--nb-badge-fg":
      "color-mix(in oklch, var(--primary) 90%, var(--foreground))",
  },
  warn: {
    "--nb-badge-bg":
      "color-mix(in oklch, var(--chart-5, #f59e0b) 25%, var(--background))",
    "--nb-badge-border":
      "color-mix(in oklch, var(--chart-5, #f59e0b) 70%, transparent)",
    "--nb-badge-fg":
      "color-mix(in oklch, var(--chart-5, #f59e0b) 80%, var(--foreground))",
  },
  error: {
    "--nb-badge-bg":
      "color-mix(in oklch, var(--destructive) 30%, var(--background))",
    "--nb-badge-border":
      "color-mix(in oklch, var(--destructive) 65%, transparent)",
    "--nb-badge-fg":
      "color-mix(in oklch, var(--destructive) 85%, var(--foreground))",
  },
};

export const BadgeTag: React.FC<BadgeProps> = ({
  text,
  color,
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const tone = badgeToneVars[color ?? "default"] ?? badgeToneVars["default"];
  return (
    <span
      data-theme-mode={mode}
      className={clsx("relative inline-flex items-center", className)}
    >
      <span
        className="inline-flex min-h-[1.5rem] items-center justify-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold leading-none"
        style={
          {
            ...tone,
            backgroundColor: "var(--nb-badge-bg)",
            borderColor: "var(--nb-badge-border)",
            color: "var(--nb-badge-fg)",
          } as CSSProperties
        }
      >
        {text}
      </span>
    </span>
  );
};
