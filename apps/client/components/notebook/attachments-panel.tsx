"use client";

import { useCallback, useMemo, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useAttachmentUploader,
  useAttachmentDropzone,
  buildAttachmentContentUrl,
  type AttachmentMetadata,
} from "@/components/notebook/attachment-utils";
import MediaDialog from "@/components/ui/media-dialog";
import {
  FileIcon,
  ImageIcon,
  Link as LinkIcon,
  Trash2,
  Copy,
} from "lucide-react";

export interface AttachmentsPanelProps {
  notebookId: string;
  attachments: AttachmentMetadata[];
  loading?: boolean;
  error?: string | null;
  onDelete: (id: string) => Promise<void> | void;
  onAttachmentUploaded: (attachment: AttachmentMetadata, url: string) => void;
  canEdit: boolean;
}

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value < 1024) {
    return `${value} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatDateTime = (value: string) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const isImage = (mimeType: string) => mimeType.startsWith("image/");

const AttachmentPreview = ({
  url,
  mimeType,
  alt,
  onClick,
}: {
  url: string;
  mimeType: string;
  alt: string;
  onClick?: () => void;
}) => {
  const [broken, setBroken] = useState(false);
  const showImage = isImage(mimeType) && !broken;
  const clickable = typeof onClick === "function" && showImage;

  const Wrapper = clickable ? "button" : "div";

  return (
    <Wrapper
      type={clickable ? "button" : undefined}
      onClick={clickable ? onClick : undefined}
      className={cn(
        "relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-md bg-muted ring-1 ring-border/80",
        clickable &&
          "cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary/60"
      )}
      aria-label={clickable ? "Preview attachment" : undefined}
    >
      {showImage ? (
        <Image
          src={url}
          alt={alt}
          fill
          sizes="48px"
          style={{ objectFit: "cover" }}
          loading="lazy"
          unoptimized
          onError={() => setBroken(true)}
        />
      ) : (
        <FileIcon className="h-6 w-6 text-muted-foreground" />
      )}
    </Wrapper>
  );
};

const formatDisplayName = (filename: string, maxLength = 28) => {
  if (filename.length <= maxLength) {
    return filename;
  }
  const dot = filename.lastIndexOf(".");
  const ext = dot > 0 ? filename.slice(dot) : "";
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const available = maxLength - ext.length - 1;
  if (available <= 0) {
    return `${filename.slice(0, maxLength - 1)}…`;
  }
  const prefixLength = Math.ceil(available / 2);
  const suffixLength = Math.floor(available / 2);
  const prefix = base.slice(0, prefixLength);
  const suffix = base.slice(base.length - suffixLength);
  return `${prefix}…${suffix}${ext}`;
};

const AttachmentsPanel = ({
  notebookId,
  attachments,
  loading = false,
  error = null,
  onDelete,
  onAttachmentUploaded,
  canEdit,
}: AttachmentsPanelProps) => {
  const [preview, setPreview] = useState<{
    attachment: AttachmentMetadata;
    url: string;
  } | null>(null);

  const handlePreview = useCallback(
    (attachment: AttachmentMetadata, url: string) => {
      setPreview({ attachment, url });
    },
    []
  );

  const { uploadFiles, isUploading, uploadStatus, uploadError } =
    useAttachmentUploader({
      notebookId,
      onUploaded: onAttachmentUploaded,
    });

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (!canEdit) {
        return;
      }
      await uploadFiles(files);
    },
    [canEdit, uploadFiles]
  );

  const {
    isDraggingOver,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useAttachmentDropzone({
    disabled: isUploading || !canEdit,
    onFiles: handleUploadFiles,
  });

  const sortedAttachments = useMemo(() => {
    return [...attachments].sort((a, b) => {
      const aTime = Date.parse(a.createdAt);
      const bTime = Date.parse(b.createdAt);
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return bTime - aTime;
    });
  }, [attachments]);

  const hasAttachments = sortedAttachments.length > 0;

  return (
    <>
      <div
        className={cn(
          "relative mb-4 flex flex-col items-center justify-center gap-2 overflow-hidden rounded-md border border-dashed border-border/60 p-4 text-sm text-muted-foreground transition",
          isDraggingOver && "border-primary text-primary",
          isUploading && "border-primary/70",
          !canEdit && "opacity-70"
        )}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingOver ? (
          <div className="pointer-events-none absolute inset-0 rounded-md border-2 border-dashed border-primary/70 bg-primary/10" />
        ) : null}
        {isUploading ? (
          <span>
            {uploadStatus
              ? `Uploading attachment ${uploadStatus.current} of ${uploadStatus.total}…`
              : "Uploading attachments…"}
          </span>
        ) : canEdit ? (
          <span>Drop files here to upload new attachments</span>
        ) : (
          <span>Attachments are read-only.</span>
        )}
        {uploadError ? (
          <span className="text-xs text-rose-500">{uploadError}</span>
        ) : null}
      </div>

      {error ? <p className="mb-2 text-[11px] text-rose-500">{error}</p> : null}

      {loading ? (
        <p className="text-[11px] text-muted-foreground">
          Loading attachments…
        </p>
      ) : hasAttachments ? (
        <ul className="space-y-3">
          {sortedAttachments.map((attachment) => {
            const url = buildAttachmentContentUrl(
              attachment.notebookId,
              attachment.id
            );
            return (
              <AttachmentRow
                key={attachment.id}
                attachment={attachment}
                url={url}
                onDelete={onDelete}
                onPreview={handlePreview}
                canEdit={canEdit}
              />
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No attachments uploaded yet.
        </p>
      )}

      <MediaDialog
        open={preview !== null}
        onOpenChange={(open) => (!open ? setPreview(null) : undefined)}
        title={preview?.attachment.filename ?? ""}
        src={preview?.url ?? ""}
        mimeType={preview?.attachment.mimeType ?? ""}
        sizeLabel={preview ? formatBytes(preview.attachment.size) : undefined}
      />
    </>
  );
};

const AttachmentRow = ({
  attachment,
  url,
  onDelete,
  onPreview,
  canEdit,
}: {
  attachment: AttachmentMetadata;
  url: string;
  onDelete: (id: string) => Promise<void> | void;
  onPreview: (attachment: AttachmentMetadata, url: string) => void;
  canEdit: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const displayName = useMemo(
    () => formatDisplayName(attachment.filename),
    [attachment.filename]
  );
  const canPreview = isImage(attachment.mimeType);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (typeof document !== "undefined") {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [url]);

  const handleDelete = useCallback(() => {
    if (!canEdit) {
      return;
    }
    void onDelete(attachment.id);
  }, [attachment.id, canEdit, onDelete]);

  const handlePreview = useCallback(() => {
    if (!canPreview) return;
    onPreview(attachment, url);
  }, [attachment, canPreview, onPreview, url]);

  const previewAlt = `${attachment.filename} preview`;

  return (
    <li className="flex items-start gap-3 rounded-md border border-border/60 p-3 text-[12px]">
      <AttachmentPreview
        url={url}
        mimeType={attachment.mimeType}
        alt={previewAlt}
        onClick={handlePreview}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              className="block w-full truncate pr-10 text-left font-medium text-foreground hover:underline"
              onClick={handleCopy}
              title={attachment.filename}
            >
              {displayName}
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
              aria-label="Copy attachment URL"
            >
              {copied ? (
                <LinkIcon className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-rose-600 hover:text-rose-600"
                onClick={handleDelete}
                aria-label="Delete attachment"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>{attachment.mimeType}</span>
          <span aria-hidden>•</span>
          <span>{formatBytes(attachment.size)}</span>
          <span aria-hidden>•</span>
          <span>{formatDateTime(attachment.createdAt)}</span>
          {isImage(attachment.mimeType) ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <ImageIcon className="h-3.5 w-3.5" />
              Image
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
};

export default AttachmentsPanel;
