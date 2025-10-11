import { Buffer } from "node:buffer";
import type { FastifyInstance } from "fastify";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import type {
  NotebookAttachment,
  NotebookCollaboratorStore,
  NotebookStore,
} from "../types.js";
import { ensureNotebookAccess } from "../notebooks/permissions.js";

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB ceiling per file
const MAX_CHUNK_SIZE_BYTES = 512 * 1024; // 512 KiB per chunk to stay below Fastify bodyLimit
const UPLOAD_TTL_MS = 5 * 60 * 1000; // 5 minutes

const AttachmentUploadInitSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1).default("application/octet-stream"),
  size: z.number().int().nonnegative().optional(),
});

const AttachmentChunkSchema = z.object({
  chunk: z.string().min(1),
  index: z.number().int().nonnegative(),
  isLast: z.boolean().optional().default(false),
});

const AttachmentDeleteParamsSchema = z.object({
  id: z.string(),
  attachmentId: z.string(),
});

const AttachmentParamsSchema = z.object({ id: z.string() });

type PendingUpload = {
  id: string;
  notebookId: string;
  filename: string;
  mimeType: string;
  expectedSize?: number;
  createdAt: number;
  nextIndex: number;
  totalBytes: number;
  chunks: Buffer[];
};

const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 16);

const encodeUrlComponent = (value: string) => encodeURIComponent(value);

const buildAttachmentContentUrl = (notebookId: string, attachmentId: string) =>
  `/api/notebooks/${encodeUrlComponent(notebookId)}/attachments/${encodeUrlComponent(
    attachmentId
  )}/content`;

const cleanupExpiredUploads = (
  uploads: Map<string, PendingUpload>,
  now = Date.now()
) => {
  for (const [id, pending] of uploads) {
    if (now - pending.createdAt > UPLOAD_TTL_MS) {
      uploads.delete(id);
    }
  }
};

const decodeChunk = (chunk: string): Buffer => {
  try {
    const buffer = Buffer.from(chunk, "base64");
    if (buffer.byteLength === 0) {
      throw new Error("Empty chunk");
    }
    return buffer;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Invalid base64 chunk"
    );
  }
};

const persistAttachment = async (
  store: NotebookStore,
  upload: PendingUpload
) => {
  const content = Buffer.concat(upload.chunks, upload.totalBytes);
  const attachment = await store.saveAttachment(upload.notebookId, {
    filename: upload.filename,
    mimeType: upload.mimeType,
    content,
  });
  return attachment;
};

const summarize = (attachment: NotebookAttachment) => ({
  id: attachment.id,
  notebookId: attachment.notebookId,
  filename: attachment.filename,
  mimeType: attachment.mimeType,
  size: attachment.size,
  createdAt: attachment.createdAt,
  updatedAt: attachment.updatedAt,
});

export const registerAttachmentRoutes = (
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore
) => {
  const uploads = new Map<string, PendingUpload>();

  app.get("/notebooks/:id/attachments", async (request, reply) => {
    const params = AttachmentParamsSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: "Invalid notebook id" };
    }

    const notebook = await store.get(params.data.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    if (!notebook.published) {
      if (
        !(await ensureNotebookAccess(
          request,
          reply,
          collaborators,
          notebook.id,
          "editor"
        ))
      ) {
        return;
      }

      if (
        !(await ensureNotebookAccess(
          request,
          reply,
          collaborators,
          notebook.id,
          "viewer"
        ))
      ) {
        return;
      }
    }

    const attachments = await store.listAttachments(notebook.id);
    return { data: attachments.map(summarize) };
  });

  app.post("/notebooks/:id/attachments/uploads", async (request, reply) => {
    const params = AttachmentParamsSchema.safeParse(request.params);
    if (!params.success) {
      reply.code(400);
      return { error: "Invalid notebook id" };
    }

    const body = AttachmentUploadInitSchema.safeParse(request.body ?? {});
    if (!body.success) {
      reply.code(400);
      return { error: "Invalid attachment metadata" };
    }

    const notebook = await store.get(params.data.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    if (typeof body.data.size === "number") {
      if (body.data.size === 0) {
        reply.code(400);
        return { error: "Attachment size must be greater than zero" };
      }
      if (body.data.size > MAX_ATTACHMENT_SIZE_BYTES) {
        reply.code(413);
        return { error: "Attachment exceeds maximum allowed size" };
      }
    }

    cleanupExpiredUploads(uploads);

    const uploadId = nanoid();
    uploads.set(uploadId, {
      id: uploadId,
      notebookId: notebook.id,
      filename: body.data.filename,
      mimeType: body.data.mimeType,
      expectedSize: body.data.size,
      createdAt: Date.now(),
      nextIndex: 0,
      totalBytes: 0,
      chunks: [],
    });

    reply.code(201);
    return {
      data: {
        uploadId,
        maxChunkBytes: MAX_CHUNK_SIZE_BYTES,
        maxAttachmentBytes: MAX_ATTACHMENT_SIZE_BYTES,
      },
    };
  });

  app.post(
    "/notebooks/:id/attachments/uploads/:uploadId/chunk",
    async (request, reply) => {
      const params = z
        .object({ id: z.string(), uploadId: z.string() })
        .safeParse(request.params);
      if (!params.success) {
        reply.code(400);
        return { error: "Invalid upload parameters" };
      }

      const body = AttachmentChunkSchema.safeParse(request.body ?? {});
      if (!body.success) {
        reply.code(400);
        return { error: "Invalid attachment chunk" };
      }

      const upload = uploads.get(params.data.uploadId);
      if (!upload || upload.notebookId !== params.data.id) {
        reply.code(404);
        return { error: "Upload session not found" };
      }

      if (
        !(await ensureNotebookAccess(
          request,
          reply,
          collaborators,
          upload.notebookId,
          "editor"
        ))
      ) {
        return;
      }

      if (body.data.index !== upload.nextIndex) {
        reply.code(409);
        return { error: "Unexpected chunk index" };
      }

      let decoded: Buffer;
      try {
        decoded = decodeChunk(body.data.chunk);
      } catch (error) {
        reply.code(400);
        return {
          error: error instanceof Error ? error.message : "Invalid chunk",
        };
      }

      if (decoded.byteLength > MAX_CHUNK_SIZE_BYTES) {
        reply.code(413);
        return { error: "Chunk exceeds maximum allowed size" };
      }

      const nextTotal = upload.totalBytes + decoded.byteLength;
      if (nextTotal > MAX_ATTACHMENT_SIZE_BYTES) {
        reply.code(413);
        return { error: "Attachment exceeds maximum allowed size" };
      }

      upload.chunks.push(decoded);
      upload.totalBytes = nextTotal;
      upload.nextIndex += 1;

      const isLast = body.data.isLast ?? false;
      if (!isLast) {
        return {
          data: {
            receivedBytes: upload.totalBytes,
            nextIndex: upload.nextIndex,
          },
        };
      }

      if (upload.expectedSize && upload.expectedSize !== upload.totalBytes) {
        uploads.delete(upload.id);
        reply.code(400);
        return { error: "Attachment size does not match declared size" };
      }

      uploads.delete(upload.id);

      try {
        const attachment = await persistAttachment(store, upload);
        return {
          data: {
            attachment: summarize(attachment),
            url: buildAttachmentContentUrl(
              attachment.notebookId,
              attachment.id
            ),
          },
        };
      } catch (error) {
        reply.code(500);
        return {
          error:
            error instanceof Error
              ? error.message
              : "Failed to persist attachment",
        };
      }
    }
  );

  app.get(
    "/notebooks/:id/attachments/:attachmentId",
    async (request, reply) => {
      const params = AttachmentDeleteParamsSchema.safeParse(request.params);
      if (!params.success) {
        reply.code(400);
        return { error: "Invalid attachment parameters" };
      }

      const attachment = await store.getAttachment(
        params.data.id,
        params.data.attachmentId
      );
      if (!attachment) {
        reply.code(404);
        return { error: "Attachment not found" };
      }

      const notebook = await store.get(attachment.notebookId);
      if (!notebook) {
        reply.code(404);
        return { error: "Notebook not found" };
      }

      if (!notebook.published) {
        if (
          !(await ensureNotebookAccess(
            request,
            reply,
            collaborators,
            attachment.notebookId,
            "viewer"
          ))
        ) {
          return;
        }
      }

      return { data: summarize(attachment) };
    }
  );

  app.get(
    "/notebooks/:id/attachments/:attachmentId/content",
    async (request, reply) => {
      const params = AttachmentDeleteParamsSchema.safeParse(request.params);
      if (!params.success) {
        reply.code(400);
        return { error: "Invalid attachment parameters" };
      }

      const attachment = await store.getAttachment(
        params.data.id,
        params.data.attachmentId
      );
      if (!attachment) {
        reply.code(404);
        return { error: "Attachment not found" };
      }

      const notebook = await store.get(attachment.notebookId);
      if (!notebook) {
        reply.code(404);
        return { error: "Notebook not found" };
      }

      if (!notebook.published) {
        if (
          !(await ensureNotebookAccess(
            request,
            reply,
            collaborators,
            attachment.notebookId,
            "viewer"
          ))
        ) {
          return;
        }
      }

      reply.header("Content-Type", attachment.mimeType);
      reply.header("Content-Length", String(attachment.size));
      reply.header(
        "Content-Disposition",
        `inline; filename="${attachment.filename.replace(/"/g, '\\"')}"`
      );

      return reply.send(Buffer.from(attachment.content));
    }
  );

  app.delete(
    "/notebooks/:id/attachments/:attachmentId",
    async (request, reply) => {
      const params = AttachmentDeleteParamsSchema.safeParse(request.params);
      if (!params.success) {
        reply.code(400);
        return { error: "Invalid attachment parameters" };
      }

      const notebook = await store.get(params.data.id);
      if (!notebook) {
        reply.code(404);
        return { error: "Notebook not found" };
      }

      if (
        !(await ensureNotebookAccess(
          request,
          reply,
          collaborators,
          notebook.id,
          "editor"
        ))
      ) {
        return;
      }

      const removed = await store.removeAttachment(
        params.data.id,
        params.data.attachmentId
      );
      if (!removed) {
        reply.code(404);
        return { error: "Attachment not found" };
      }

      reply.code(204);
      return null;
    }
  );
};
