import type { Notebook } from "@nodebooks/notebook-schema";
import type { OutlineItem } from "./types";

export const formatTimestamp = (value: string) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export const parseDependencySpecifier = (raw: string) => {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  if (value.startsWith("@")) {
    const slashIndex = value.indexOf("/");
    if (slashIndex === -1) {
      return { name: value, version: "latest" };
    }
    const atIndex = value.indexOf("@", slashIndex + 1);
    if (atIndex === -1) {
      return { name: value, version: "latest" };
    }
    const name = value.slice(0, atIndex).trim();
    const version = value.slice(atIndex + 1).trim() || "latest";
    return name ? { name, version } : null;
  }
  const lastAt = value.lastIndexOf("@");
  if (lastAt > 0) {
    const name = value.slice(0, lastAt).trim();
    const version = value.slice(lastAt + 1).trim() || "latest";
    return name ? { name, version } : null;
  }
  return { name: value, version: "latest" };
};

export const parseMultipleDependencies = (raw: string) => {
  const items = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => parseDependencySpecifier(token))
    .filter((x): x is { name: string; version: string } => Boolean(x));
  return items;
};

export const buildOutlineItems = (notebook: Notebook | null | undefined) => {
  if (!notebook) return [] as OutlineItem[];
  const items: OutlineItem[] = [];
  notebook.cells.forEach((cell) => {
    if (cell.type !== "markdown" || !cell.source) return;
    const lines = cell.source.split("\n");
    lines.forEach((line, index) => {
      const match = /^(#{1,4})\s+(.*)/.exec(line.trim());
      if (match) {
        items.push({
          id: `${cell.id}-${index}`,
          cellId: cell.id,
          title: match[2].trim(),
          level: match[1].length,
        });
      }
    });
  });
  return items;
};
