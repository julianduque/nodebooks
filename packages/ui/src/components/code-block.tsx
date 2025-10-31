"use client";

import React from "react";
import type { UiCode } from "@nodebooks/notebook-schema";
import { CopyButton, type CopyButtonProps } from "./copy-button.js";
import clsx from "clsx";
import { highlightCode, normalizeLanguage } from "../lib/highlight.js";
import { useComponentThemeMode } from "./utils.js";

type CopyValue = string | (() => string);

type CodeBlockProps = Omit<UiCode, "ui"> & {
  className?: string;
  contentClassName?: string;
  themeMode?: "light" | "dark";
  copyValue?: CopyValue | null;
  copyButtonVariant?: CopyButtonProps["variant"];
  copyButtonClassName?: string;
  onCopy?: CopyButtonProps["onCopy"];
};

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language,
  className,
  contentClassName,
  themeMode,
  copyButtonVariant = "default",
  copyButtonClassName,
  copyValue,
  onCopy,
}) => {
  const mode = useComponentThemeMode(themeMode);
  const normalizedLanguage = React.useMemo(
    () => normalizeLanguage(language),
    [language]
  );
  const highlighted = React.useMemo(
    () => highlightCode(code ?? "", language),
    [code, language]
  );
  const wrapperClass = clsx("code-block relative", className);
  const surfaceClass = clsx(
    "code-block__surface m-0 overflow-auto rounded-xl border px-4 pb-3 pt-3 pr-12 text-sm leading-6 text-foreground shadow-sm",
    contentClassName ?? className,
    !contentClassName && "max-h-full"
  );
  const surfaceStyle = React.useMemo<React.CSSProperties>(() => {
    const fallbackBg =
      mode === "dark"
        ? "color-mix(in oklch, var(--background) 55%, transparent)"
        : "color-mix(in oklch, var(--foreground) 6%, var(--background))";
    const fallbackBorder =
      mode === "dark"
        ? "color-mix(in oklch, var(--border) 70%, transparent)"
        : "color-mix(in oklch, var(--border) 85%, transparent)";
    return {
      background: `var(--code-surface, ${fallbackBg})`,
      borderColor: `var(--code-border, ${fallbackBorder})`,
    };
  }, [mode]);
  const codeClass = clsx(
    "code-block__code block min-w-full whitespace-pre font-mono",
    "hljs",
    normalizedLanguage ? `language-${normalizedLanguage}` : null
  );
  const copyPayload = React.useMemo<CopyValue | null>(() => {
    if (copyValue === null) return null;
    if (typeof copyValue !== "undefined") return copyValue;
    return code ?? "";
  }, [code, copyValue]);

  return (
    <div className={wrapperClass}>
      {copyPayload ? (
        <CopyButton
          value={copyPayload}
          variant={copyButtonVariant}
          className={clsx(
            "code-block__copy-button absolute right-3 top-3 z-10 shadow-sm",
            copyButtonClassName
          )}
          onCopy={onCopy}
        />
      ) : null}
      <pre className={surfaceClass} style={surfaceStyle} data-theme-mode={mode}>
        <code
          className={codeClass}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
};
