import { useCallback, useEffect, useState } from "react";

import {
  API_BASE_URL,
  buildAttachmentsListUrl,
} from "@/components/notebook/api";
import type { AttachmentMetadata } from "@/components/notebook/attachment-utils";

export interface UseNotebookAttachmentsResult {
  attachments: AttachmentMetadata[];
  loading: boolean;
  error: string | null;
  handleAttachmentUploaded(attachment: AttachmentMetadata): void;
  handleDeleteAttachment(attachmentId: string): Promise<void>;
  setError(message: string | null): void;
}

export const useNotebookAttachments = (
  notebookId: string | null | undefined
): UseNotebookAttachmentsResult => {
  const [attachments, setAttachments] = useState<AttachmentMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAttachmentUploaded = useCallback(
    (attachment: AttachmentMetadata) => {
      setAttachments((prev) => {
        const filtered = prev.filter((item) => item.id !== attachment.id);
        return [attachment, ...filtered];
      });
      setError(null);
    },
    []
  );

  const handleDeleteAttachment = useCallback(
    async (attachmentId: string) => {
      if (!notebookId) {
        return;
      }
      try {
        const url = `${API_BASE_URL}/notebooks/${encodeURIComponent(
          notebookId
        )}/attachments/${encodeURIComponent(attachmentId)}`;
        const response = await fetch(url, { method: "DELETE" });
        if (!response.ok && response.status !== 204) {
          let message = `Failed to delete attachment (status ${response.status})`;
          try {
            const payload = await response.clone().json();
            if (payload?.error) {
              message = payload.error;
            }
          } catch {
            const text = await response.clone().text();
            if (text) message = text;
          }
          throw new Error(message);
        }
        setAttachments((prev) =>
          prev.filter((attachment) => attachment.id !== attachmentId)
        );
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete attachment"
        );
      }
    },
    [notebookId]
  );

  useEffect(() => {
    if (!notebookId) {
      setAttachments([]);
      setError(null);
      return;
    }

    let ignore = false;
    setLoading(true);
    setError(null);

    const url = buildAttachmentsListUrl(notebookId);
    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Failed to load attachments (status ${response.status})`
          );
        }
        const payload = await response.json();
        const list = Array.isArray(payload?.data)
          ? (payload.data as AttachmentMetadata[])
          : [];
        if (!ignore) {
          setAttachments(list);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "Failed to load attachments"
          );
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [notebookId]);

  return {
    attachments,
    loading,
    error,
    handleAttachmentUploaded,
    handleDeleteAttachment,
    setError,
  };
};
