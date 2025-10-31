"use client";
import React from "react";
import type { UiAlert } from "@nodebooks/notebook-schema";
import DOMPurify from "dompurify";
import { AlertTriangle, CheckCircle2, Info, OctagonX, X } from "lucide-react";
import clsx from "clsx";
import { useComponentThemeMode } from "./utils.js";

type AlertProps = Omit<UiAlert, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
  onClose?: () => void;
  dismissLabel?: string;
};

type PaletteEntry = {
  container: string;
  icon: string;
  iconBg: string;
  title: string;
  text: string;
};

const light: Record<NonNullable<UiAlert["level"]>, PaletteEntry> = {
  info: {
    container: "border-sky-200 bg-sky-50/80",
    icon: "text-sky-600",
    iconBg: "bg-sky-100",
    title: "text-slate-900",
    text: "text-slate-700",
  },
  success: {
    container: "border-emerald-200 bg-emerald-50/80",
    icon: "text-emerald-700",
    iconBg: "bg-emerald-100",
    title: "text-slate-900",
    text: "text-slate-700",
  },
  warn: {
    container: "border-amber-200 bg-amber-50/80",
    icon: "text-amber-600",
    iconBg: "bg-amber-100",
    title: "text-slate-900",
    text: "text-slate-700",
  },
  error: {
    container: "border-rose-200 bg-rose-50/80",
    icon: "text-rose-600",
    iconBg: "bg-rose-100",
    title: "text-slate-900",
    text: "text-slate-700",
  },
};

const dark: Record<NonNullable<UiAlert["level"]>, PaletteEntry> = {
  info: {
    container: "border-sky-500/60 bg-sky-500/15",
    icon: "text-sky-100",
    iconBg: "bg-sky-600/40",
    title: "text-white",
    text: "text-white",
  },
  success: {
    container: "border-emerald-500/60 bg-emerald-500/20",
    icon: "text-emerald-100",
    iconBg: "bg-emerald-600/40",
    title: "text-white",
    text: "text-white",
  },
  warn: {
    container: "border-amber-500/60 bg-amber-500/20",
    icon: "text-amber-50",
    iconBg: "bg-amber-600/40",
    title: "text-white",
    text: "text-white",
  },
  error: {
    container: "border-rose-500/60 bg-rose-500/20",
    icon: "text-rose-50",
    iconBg: "bg-rose-600/40",
    title: "text-white",
    text: "text-white",
  },
};

const iconForLevel = (level: UiAlert["level"]) => {
  switch (level) {
    case "success":
      return <CheckCircle2 className="h-4 w-4" />;
    case "warn":
      return <AlertTriangle className="h-4 w-4" />;
    case "error":
      return <OctagonX className="h-4 w-4" />;
    case "info":
    default:
      return <Info className="h-4 w-4" />;
  }
};

export const AlertCallout: React.FC<AlertProps> = ({
  level = "info",
  title,
  text,
  html,
  className,
  themeMode,
  onClose,
  dismissLabel = "Dismiss alert",
}) => {
  const mode = useComponentThemeMode(themeMode);
  const palette = mode === "light" ? light : dark;
  const s = palette[level] ?? palette.info;
  const content = html
    ? typeof window === "undefined"
      ? html
      : DOMPurify.sanitize(html, { ADD_ATTR: ["style"] })
    : undefined;

  return (
    <div
      role="alert"
      data-alert-level={level}
      className={clsx(
        "relative w-full rounded-xl border p-4 shadow-sm",
        s.container,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full",
            s.iconBg
          )}
        >
          <span className={clsx("flex", s.icon)}>{iconForLevel(level)}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          {title && (
            <div className={clsx("text-sm font-semibold", s.title)}>
              {title}
            </div>
          )}
          {html ? (
            <div
              className={clsx("text-sm leading-6", s.text)}
              dangerouslySetInnerHTML={{ __html: content! }}
            />
          ) : text ? (
            <div className={clsx("text-sm leading-6", s.text)}>{text}</div>
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground/80 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 rounded-full p-1"
            aria-label={dismissLabel}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
};
