"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Copy } from "lucide-react";

type CopyValue = string | (() => string);

export interface CopyButtonProps {
  value: CopyValue;
  className?: string;
  onCopy?: (copiedValue: string) => void;
  "aria-label"?: string;
  variant?: "default" | "dark";
}

const resolveValue = (input: CopyValue): string => {
  try {
    return typeof input === "function" ? input() : input;
  } catch {
    return "";
  }
};

const copyTextToClipboard = async (text: string) => {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard API unavailable");
  }
  await navigator.clipboard.writeText(text);
};

export const CopyButton = ({
  value,
  className,
  onCopy,
  "aria-label": ariaLabel,
  variant = "default",
}: CopyButtonProps) => {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    const text = resolveValue(value);
    if (!text) return;
    try {
      await copyTextToClipboard(text);
      setCopied(true);
      onCopy?.(text);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 2000);
    } catch {
      /* noop */
    }
  }, [onCopy, value]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className={clsx(
        "inline-flex h-7 w-7 items-center justify-center rounded-md border shadow-xs transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-0",
        variant === "dark"
          ? "backdrop-blur supports-[backdrop-filter]:bg-black/55 border-white/20 bg-black/60 text-slate-100 hover:bg-black hover:text-white focus-visible:ring-slate-700/40"
          : "backdrop-blur supports-[backdrop-filter]:bg-white/70 border-slate-200 bg-white/85 text-slate-500 hover:bg-white hover:text-slate-900 focus-visible:ring-ring/40 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-900/60 dark:supports-[backdrop-filter]:bg-slate-900/60",
        className
      )}
      aria-label={ariaLabel ?? (copied ? "Copied" : "Copy to clipboard")}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-primary" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      <span className="sr-only">{copied ? "Copied" : "Copy to clipboard"}</span>
    </button>
  );
};

export default CopyButton;
