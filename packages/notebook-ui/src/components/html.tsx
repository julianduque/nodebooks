"use client";
import React from "react";
import { UiThemeContext } from "./theme";
import type { UiHtml } from "@nodebooks/notebook-schema";
import DOMPurify from "dompurify";

type HtmlProps = Omit<UiHtml, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
export const HtmlBlock: React.FC<HtmlProps> = ({
  html,
  className,
  themeMode,
}) => {
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
  const safe =
    typeof window === "undefined"
      ? String(html ?? "")
      : DOMPurify.sanitize(html ?? "", { ADD_ATTR: ["style"] });
  const darkVars =
    mode === "dark"
      ? ({
          "--foreground": "#e5e7eb",
          "--muted": "#1f2937",
          "--border": "#334155",
        } as React.CSSProperties & Record<`--${string}`, string>)
      : undefined;
  return (
    <div
      className={`relative rounded-md border p-3 ${className ?? ""} ${mode === "light" ? "bg-white border-slate-200" : "bg-slate-900 border-slate-800"}`}
      style={{ color: "var(--foreground)", ...(darkVars ?? {}) }}
    >
      <div dangerouslySetInnerHTML={{ __html: safe }} />
    </div>
  );
};
