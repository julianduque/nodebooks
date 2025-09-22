import React from "react";
import type { UiImage } from "@nodebooks/notebook-schema";

type ImageProps = UiImage & { className?: string };
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
}) => {
  let resolvedSrc = src;
  const isDataUrl = typeof src === "string" && src.startsWith("data:");
  const isHttp = typeof src === "string" && /^(https?:)?\/\//.test(src);

  if (!isDataUrl && !isHttp && typeof src === "string") {
    const mt = mimeType ?? "image/png";
    resolvedSrc = `data:${mt};base64,${src}`;
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
    <img
      src={resolvedSrc}
      alt={alt ?? ""}
      style={style}
      className={className}
    />
  );
};
