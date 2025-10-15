"use client";
import React from "react";
import { UiThemeContext } from "./theme";
import type { UiAlert } from "@nodebooks/notebook-schema";
import DOMPurify from "dompurify";
import { AlertTriangle, CheckCircle2, Info, OctagonX } from "lucide-react";

type AlertProps = Omit<UiAlert, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};

const light = {
  info: {
    box: "border-sky-300 bg-sky-50",
    text: "text-sky-800",
    title: "text-sky-900",
    icon: "text-sky-600",
  },
  success: {
    box: "border-emerald-300 bg-emerald-50",
    text: "text-emerald-800",
    title: "text-emerald-900",
    icon: "text-emerald-600",
  },
  warn: {
    box: "border-amber-300 bg-amber-50",
    text: "text-amber-800",
    title: "text-amber-900",
    icon: "text-amber-600",
  },
  error: {
    box: "border-rose-300 bg-rose-50",
    text: "text-rose-800",
    title: "text-rose-900",
    icon: "text-rose-600",
  },
} as const;

const dark = {
  info: {
    box: "border-sky-500 bg-sky-600",
    text: "text-slate-100",
    title: "text-white",
    icon: "text-white",
  },
  success: {
    box: "border-emerald-500 bg-emerald-600",
    text: "text-slate-100",
    title: "text-white",
    icon: "text-white",
  },
  warn: {
    box: "border-amber-500 bg-amber-600",
    text: "text-slate-100",
    title: "text-white",
    icon: "text-white",
  },
  error: {
    box: "border-rose-500 bg-rose-600",
    text: "text-slate-100",
    title: "text-white",
    icon: "text-white",
  },
} as const;

export const AlertCallout: React.FC<AlertProps> = ({
  level = "info",
  title,
  text,
  html,
  className,
  themeMode,
}) => {
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  const palette = mode === "light" ? light : dark;
  const s = palette[level] ?? palette.info;
  const content = html
    ? typeof window === "undefined"
      ? html
      : DOMPurify.sanitize(html, { ADD_ATTR: ["style"] })
    : undefined;
  return (
    <div
      className={`relative rounded-md border p-3 ${s.box} ${className ?? ""}`}
    >
      <div className="flex items-start gap-2">
        <div className={`mt-0.5 ${s.icon}`}>
          {level === "success" ? (
            <CheckCircle2 size={16} />
          ) : level === "warn" ? (
            <AlertTriangle size={16} />
          ) : level === "error" ? (
            <OctagonX size={16} />
          ) : (
            <Info size={16} />
          )}
        </div>
        <div className="min-w-0">
          {title && <div className={`font-semibold ${s.title}`}>{title}</div>}
          {html ? (
            <div
              className={`text-sm leading-5 ${s.text}`}
              dangerouslySetInnerHTML={{ __html: content! }}
            />
          ) : text ? (
            <div className={`text-sm leading-5 ${s.text}`}>{text}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
