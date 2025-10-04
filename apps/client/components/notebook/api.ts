import { clientConfig } from "@nodebooks/config/client";

const rawApiBaseUrl = clientConfig().apiBaseUrl ?? "/api";

export const API_BASE_URL =
  rawApiBaseUrl.length > 1 && rawApiBaseUrl.endsWith("/")
    ? rawApiBaseUrl.replace(/\/+$/, "")
    : rawApiBaseUrl;

export const buildAttachmentsListUrl = (notebookId: string) =>
  `${API_BASE_URL}/notebooks/${encodeURIComponent(notebookId)}/attachments`;
