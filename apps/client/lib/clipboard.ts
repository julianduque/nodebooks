"use client";

export const copyTextToClipboard = async (value: string) => {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard API is not available in this environment.");
  }
  await navigator.clipboard.writeText(value);
};
