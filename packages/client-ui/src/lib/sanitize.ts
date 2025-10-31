import DOMPurify from "isomorphic-dompurify";
import type { Config as DomPurifyConfig } from "dompurify";

const DEFAULT_ADD_ATTR: readonly string[] = [
  "class",
  "style",
  "target",
  "rel",
  "aria-label",
  "aria-labelledby",
  "aria-describedby",
  "data-footnote-ref",
  "data-footnote-backref",
];

const mergeAddAttributes = (
  base: readonly string[],
  extras: DomPurifyConfig["ADD_ATTR"]
): DomPurifyConfig["ADD_ATTR"] => {
  if (!extras) {
    return [...base];
  }
  if (typeof extras === "function") {
    return extras;
  }
  if (extras.length === 0) {
    return [...base];
  }
  return Array.from(new Set([...base, ...extras]));
};

const createDomPurifyConfig = (config?: DomPurifyConfig): DomPurifyConfig => {
  const merged: DomPurifyConfig = {
    ...config,
    ADD_ATTR: mergeAddAttributes(DEFAULT_ADD_ATTR, config?.ADD_ATTR),
  };

  if (config?.ADD_TAGS) {
    merged.ADD_TAGS =
      typeof config.ADD_TAGS === "function"
        ? config.ADD_TAGS
        : Array.from(new Set(config.ADD_TAGS));
  }

  if (!config?.USE_PROFILES) {
    merged.USE_PROFILES = { html: true };
  } else if (config.USE_PROFILES) {
    merged.USE_PROFILES = { ...config.USE_PROFILES };
  }

  return merged;
};

const sanitizeHtml = (raw: string, config?: DomPurifyConfig) =>
  DOMPurify.sanitize(raw, createDomPurifyConfig(config));

export const sanitizeHtmlSnippet = (snippet: string) =>
  sanitizeHtml(snippet, { ADD_TAGS: ["span"] });
