import React from "react";
import type { UiAlert } from "@nodebooks/notebook-schema";
import DOMPurify from "dompurify";

type AlertProps = UiAlert & { className?: string };
const alertStyles = {
  info: {
    box: "border-sky-400 bg-sky-100/80",
    text: "text-sky-800",
    title: "text-sky-900",
  },
  success: {
    box: "border-emerald-400 bg-emerald-100/80",
    text: "text-emerald-800",
    title: "text-emerald-900",
  },
  warn: {
    box: "border-amber-400 bg-amber-100/80",
    text: "text-amber-800",
    title: "text-amber-900",
  },
  error: {
    box: "border-rose-400 bg-rose-100/80",
    text: "text-rose-800",
    title: "text-rose-900",
  },
} as const;

export const AlertCallout: React.FC<AlertProps> = ({
  level = "info",
  title,
  text,
  html,
  className,
}) => {
  const s = alertStyles[level] ?? alertStyles.info;
  const content = html
    ? DOMPurify.sanitize(html, { ADD_ATTR: ["style"] })
    : undefined;
  return (
    <div className={`rounded-lg border p-3 ${s.box} ${className ?? ""}`}>
      {title && <div className={`font-semibold ${s.title}`}>{title}</div>}
      {html ? (
        <div
          className={`text-sm ${s.text}`}
          dangerouslySetInnerHTML={{ __html: content! }}
        />
      ) : text ? (
        <div className={`text-sm ${s.text}`}>{text}</div>
      ) : null}
    </div>
  );
};
