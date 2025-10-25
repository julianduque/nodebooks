"use client";
import React from "react";
import type { UiImage } from "@nodebooks/notebook-schema";
import { useComponentThemeMode } from "./utils";

type ImageProps = Omit<UiImage, "ui"> & {
  className?: string;
  themeMode?: "light" | "dark";
};
const toSize = (v?: number | string) => (typeof v === "number" ? `${v}px` : v);

export const Image: React.FC<ImageProps> = ({
  src,
  mimeType,
  alt,
  width,
  height,
  fit = "contain",
  borderRadius,
  className,
  themeMode,
}) => {
  const mode = useComponentThemeMode(themeMode);
  let resolvedSrc = src;
  const isDataUrl = typeof src === "string" && src.startsWith("data:");
  const isHttp = typeof src === "string" && /^(https?:)?\/\//i.test(src);
  // Heuristic: a raw base64 payload contains only base64 chars and optional padding
  const isLikelyBase64 =
    typeof src === "string" &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(src.replace(/\s+/g, "")) &&
    src.length >= 32; // avoid short accidental matches

  // If not a data URL or http(s), decide between base64 vs. path/local URL
  if (!isDataUrl && !isHttp && typeof src === "string") {
    if (isLikelyBase64) {
      const mt = mimeType ?? "image/png";
      resolvedSrc = `data:${mt};base64,${src}`;
    } else {
      // Leave as-is for paths like "/assets/logo.svg", "./img.png", "blob:...", etc.
      resolvedSrc = src;
    }
  }

  const style: React.CSSProperties = {
    objectFit: fit,
    borderRadius,
    maxWidth: "100%",
    height: toSize(height),
    width: toSize(width),
    display: "block",
  };

  return (
    <div
      className={`relative inline-block rounded-md border p-2 ${className ?? ""} ${
        mode === "light"
          ? "bg-slate-100 border-slate-200"
          : "bg-slate-900 border-slate-800"
      }`}
    >
      <img src={resolvedSrc} alt={alt ?? ""} style={style} className="block" />
    </div>
  );
};
