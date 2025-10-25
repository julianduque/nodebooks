import hljs from "highlight.js";

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const normalizeLanguage = (lang?: string) => {
  const language = lang?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!language) return undefined;
  return /^[a-z0-9#+_-]+$/.test(language) ? language : undefined;
};

export const highlightCode = (code: string, language?: string) => {
  const lang = normalizeLanguage(language);
  if (lang) {
    try {
      if (hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
    } catch {
      /* no-op */
    }
  }
  try {
    return hljs.highlightAuto(code).value;
  } catch {
    return escapeHtml(code);
  }
};
