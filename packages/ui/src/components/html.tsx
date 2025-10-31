"use client";
import React from "react";
import type { UiHtml } from "@nodebooks/notebook-schema";
import DOMPurify from "dompurify";
import { useComponentThemeMode } from "./utils.js";

type HtmlProps = Omit<UiHtml, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
export const HtmlBlock: React.FC<HtmlProps> = ({
  html,
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const safe =
    typeof window === "undefined"
      ? String(html ?? "")
      : DOMPurify.sanitize(html ?? "", { ADD_ATTR: ["style"] });
  return (
    <div
      data-theme-mode={mode}
      className={`relative rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm ${className ?? ""}`}
    >
      <div dangerouslySetInnerHTML={{ __html: safe }} />
    </div>
  );
};
