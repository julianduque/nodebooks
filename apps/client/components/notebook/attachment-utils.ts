import type { DragEventHandler } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { clientConfig } from "@nodebooks/config/client";

const apiBaseRaw = clientConfig().apiBaseUrl ?? "/api";
const apiBase =
  apiBaseRaw.length > 1 && apiBaseRaw.endsWith("/")
    ? apiBaseRaw.replace(/\/+$/, "")
    : apiBaseRaw;

const MAX_CHUNK_FALLBACK = 512 * 1024;

const encodeBytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    const slice = bytes.subarray(offset, offset + chunk);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
};

const attachmentsBasePath = (notebookId: string) =>
  `${apiBase}/notebooks/${encodeURIComponent(notebookId)}/attachments`;

const chunkEndpoint = (notebookId: string, uploadId: string) =>
  `${attachmentsBasePath(notebookId)}/uploads/${encodeURIComponent(uploadId)}/chunk`;

export const buildAttachmentContentUrl = (
  notebookId: string,
  attachmentId: string
) =>
  `${attachmentsBasePath(notebookId)}/${encodeURIComponent(
    attachmentId
  )}/content`;

export interface AttachmentMetadata {
  id: string;
  notebookId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface AttachmentUploadResult {
  attachment: AttachmentMetadata;
  url: string;
}

export interface AttachmentUploadStatus {
  total: number;
  current: number;
}

interface UploadInitResponse {
  data?: {
    uploadId?: string;
    maxChunkBytes?: number;
  };
  error?: string;
}

interface UploadChunkResponse {
  data?: AttachmentUploadResult;
  error?: string;
}

const readErrorMessage = async (response: Response) => {
  try {
    const payload = await response.clone().json();
    if (payload?.error) {
      return String(payload.error);
    }
  } catch {
    const text = await response.clone().text();
    if (text) return text;
  }
  return `Request failed with status ${response.status}`;
};

export const useAttachmentUploader = ({
  notebookId,
  onUploaded,
}: {
  notebookId: string;
  onUploaded?: (attachment: AttachmentMetadata, url: string) => void;
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] =
    useState<AttachmentUploadStatus | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const baseUrl = useMemo(() => attachmentsBasePath(notebookId), [notebookId]);

  const uploadSingle = useCallback(
    async (file: File): Promise<AttachmentUploadResult> => {
      const initResponse = await fetch(`${baseUrl}/uploads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        }),
      });

      if (!initResponse.ok) {
        const message = await readErrorMessage(initResponse);
        throw new Error(message);
      }

      const initPayload = (await initResponse.json()) as UploadInitResponse;
      const uploadId = initPayload?.data?.uploadId;
      if (!uploadId) {
        throw new Error("Upload session not initialised");
      }

      const chunkSizeRaw = initPayload?.data?.maxChunkBytes;
      const chunkSize =
        typeof chunkSizeRaw === "number" && chunkSizeRaw > 0
          ? chunkSizeRaw
          : MAX_CHUNK_FALLBACK;

      const endpoint = chunkEndpoint(notebookId, uploadId);
      let offset = 0;
      let index = 0;
      let finalPayload: AttachmentUploadResult | undefined;

      while (offset < file.size) {
        const end = Math.min(offset + chunkSize, file.size);
        const buffer = await file.slice(offset, end).arrayBuffer();
        const chunkBase64 = encodeBytesToBase64(new Uint8Array(buffer));
        const isLast = end >= file.size;

        const chunkResponse = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chunk: chunkBase64, index, isLast }),
        });

        if (!chunkResponse.ok) {
          const message = await readErrorMessage(chunkResponse);
          throw new Error(message);
        }

        if (isLast) {
          const payload = (await chunkResponse.json()) as
            | UploadChunkResponse
            | undefined;
          if (!payload?.data) {
            throw new Error(
              payload?.error ?? "Attachment upload did not finish"
            );
          }
          finalPayload = payload.data;
        }

        offset = end;
        index += 1;
      }

      if (!finalPayload) {
        throw new Error("Attachment upload did not return metadata");
      }

      return finalPayload;
    },
    [baseUrl, notebookId]
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      const valid = files.filter((file) => file && file.size > 0);
      if (valid.length === 0) {
        return [] as AttachmentUploadResult[];
      }

      setUploadError(null);
      setIsUploading(true);
      setUploadStatus({ total: valid.length, current: 0 });

      const results: AttachmentUploadResult[] = [];
      try {
        for (let i = 0; i < valid.length; i += 1) {
          setUploadStatus({ total: valid.length, current: i + 1 });
          const result = await uploadSingle(valid[i]);
          results.push(result);
          onUploaded?.(result.attachment, result.url);
        }
        return results;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to upload attachment";
        setUploadError(message);
        return results;
      } finally {
        setIsUploading(false);
        setUploadStatus(null);
      }
    },
    [onUploaded, uploadSingle]
  );

  const resetError = useCallback(() => setUploadError(null), []);

  return {
    uploadFiles,
    isUploading,
    uploadStatus,
    uploadError,
    resetError,
  } as const;
};

const isFileDrag = (event: React.DragEvent<HTMLElement>) => {
  const types = Array.from(event.dataTransfer?.types ?? []);
  return types.includes("Files");
};

export const useAttachmentDropzone = ({
  disabled,
  onFiles,
}: {
  disabled?: boolean;
  onFiles: (files: File[]) => void | Promise<void>;
}) => {
  const dragDepthRef = useRef(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDraggingOver(false);
  }, []);

  const handleDragEnter = useCallback<DragEventHandler<HTMLElement>>(
    (event) => {
      if (disabled || !isFileDrag(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingOver(true);
    },
    [disabled]
  );

  const handleDragOver = useCallback<DragEventHandler<HTMLElement>>(
    (event) => {
      if (disabled || !isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [disabled]
  );

  const handleDragLeave = useCallback<DragEventHandler<HTMLElement>>(
    (event) => {
      if (disabled || !isFileDrag(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDraggingOver(false);
      }
    },
    [disabled]
  );

  const handleDrop = useCallback<DragEventHandler<HTMLElement>>(
    (event) => {
      if (disabled || !isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const files = Array.from(event.dataTransfer?.files ?? []).filter(
        (file) => file && file.size > 0
      );
      resetDragState();
      if (files.length === 0) return;
      void onFiles(files);
    },
    [disabled, onFiles, resetDragState]
  );

  return {
    isDraggingOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    resetDragState,
  } as const;
};
