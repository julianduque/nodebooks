"use client";

import React from "react";
import { UiThemeContext } from "./theme";
import type { UiCode } from "@nodebooks/notebook-schema";
import { CopyButton, type CopyButtonProps } from "./copy-button";
import clsx from "clsx";
import { highlightCode, normalizeLanguage } from "../lib/highlight";

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
  const ctx = React.useContext(UiThemeContext);
  const mode = themeMode ?? ctx ?? "light";
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
    "code-block__surface m-0 overflow-auto rounded-md border px-3 pb-3 pt-3 pr-12 text-sm leading-6",
    mode === "light"
      ? "border-slate-200 bg-slate-50 text-slate-800"
      : "border-slate-700 bg-slate-900 text-slate-200",
    contentClassName ?? className,
    !contentClassName && "max-h-full"
  );
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
      <pre className={surfaceClass}>
        <code
          className={codeClass}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
};
