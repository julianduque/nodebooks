import { clientConfig } from "@nodebooks/config/client";
import type { Project } from "@nodebooks/notebook-schema";
import type { NotebookWithAccess } from "@/components/notebook/types";

const rawApiBaseUrl = clientConfig().apiBaseUrl ?? "/api";

export const API_BASE_URL =
  rawApiBaseUrl.length > 1 && rawApiBaseUrl.endsWith("/")
    ? rawApiBaseUrl.replace(/\/+$/, "")
    : rawApiBaseUrl;

export const buildAttachmentsListUrl = (notebookId: string) =>
  `${API_BASE_URL}/notebooks/${encodeURIComponent(notebookId)}/attachments`;

const buildJsonFetchOptions = (
  method: string,
  body?: Record<string, unknown> | undefined
) => ({
  method,
  ...(body !== undefined
    ? {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    : {}),
});

const parseJson = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json().catch(() => ({}))) as T;
  return payload;
};

export const publishNotebook = async (
  notebookId: string,
  slug?: string | null
): Promise<NotebookWithAccess> => {
  const response = await fetch(
    `${API_BASE_URL}/notebooks/${encodeURIComponent(notebookId)}/publish`,
    buildJsonFetchOptions("POST", slug !== undefined ? { slug } : undefined)
  );
  const payload = await parseJson<{
    data?: NotebookWithAccess;
    error?: string;
  }>(response);
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error ?? "Failed to publish notebook");
  }
  return payload.data;
};

export const unpublishNotebook = async (
  notebookId: string,
  slug?: string | null
): Promise<NotebookWithAccess> => {
  const response = await fetch(
    `${API_BASE_URL}/notebooks/${encodeURIComponent(notebookId)}/unpublish`,
    buildJsonFetchOptions("POST", slug !== undefined ? { slug } : undefined)
  );
  const payload = await parseJson<{
    data?: NotebookWithAccess;
    error?: string;
  }>(response);
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error ?? "Failed to unpublish notebook");
  }
  return payload.data;
};

interface PublishProjectPayload {
  project: Project;
  notebooks: NotebookWithAccess[];
}

export const publishProject = async (
  projectId: string,
  slug?: string | null
): Promise<PublishProjectPayload> => {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/publish`,
    buildJsonFetchOptions("POST", slug !== undefined ? { slug } : undefined)
  );
  const payload = await parseJson<{
    data?: PublishProjectPayload;
    error?: string;
  }>(response);
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error ?? "Failed to publish project");
  }
  return payload.data;
};

export const unpublishProject = async (
  projectId: string,
  slug?: string | null
): Promise<PublishProjectPayload> => {
  const response = await fetch(
    `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/unpublish`,
    buildJsonFetchOptions("POST", slug !== undefined ? { slug } : undefined)
  );
  const payload = await parseJson<{
    data?: PublishProjectPayload;
    error?: string;
  }>(response);
  if (!response.ok || !payload?.data) {
    throw new Error(payload?.error ?? "Failed to unpublish project");
  }
  return payload.data;
};
