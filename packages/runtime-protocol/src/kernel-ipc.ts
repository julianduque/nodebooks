import { z } from "zod";
import {
  CodeCellSchema,
  NotebookEnvSchema,
  NotebookOutputSchema,
  OutputExecutionSchema,
} from "@nodebooks/notebook-schema";

export const IpcRunCellSchema = z.object({
  type: z.literal("RunCell"),
  jobId: z.string(),
  cell: CodeCellSchema,
  code: z.string(),
  notebookId: z.string(),
  env: NotebookEnvSchema,
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  globals: z.record(z.string(), z.unknown()).optional(),
});

export const IpcInvokeHandlerSchema = z.object({
  type: z.literal("InvokeHandler"),
  jobId: z.string(),
  handlerId: z.string(),
  notebookId: z.string(),
  env: NotebookEnvSchema,
  event: z.string().min(1),
  payload: z.unknown().optional(),
  cellId: z.string().optional(),
  componentId: z.string().optional(),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
  globals: z.record(z.string(), z.unknown()).optional(),
});

export const IpcCancelSchema = z.object({
  type: z.literal("Cancel"),
  jobId: z.string(),
});

export const IpcPingSchema = z.object({
  type: z.literal("Ping"),
});

export const IpcControlMessageSchema = z.discriminatedUnion("type", [
  IpcRunCellSchema,
  IpcInvokeHandlerSchema,
  IpcCancelSchema,
  IpcPingSchema,
]);

export const IpcAckSchema = z.object({
  type: z.literal("Ack"),
  jobId: z.string(),
});

export const IpcResultSchema = z.object({
  type: z.literal("Result"),
  jobId: z.string(),
  outputs: z.array(NotebookOutputSchema),
  execution: OutputExecutionSchema,
  globals: z.record(z.string(), z.unknown()),
});

export const IpcErrorSchema = z.object({
  type: z.literal("Error"),
  jobId: z.string().optional(),
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
});

export const IpcPongSchema = z.object({
  type: z.literal("Pong"),
});

export const IpcEventMessageSchema = z.discriminatedUnion("type", [
  IpcAckSchema,
  IpcResultSchema,
  IpcErrorSchema,
  IpcPongSchema,
]);

export type IpcRunCell = z.infer<typeof IpcRunCellSchema>;
export type IpcInvokeHandler = z.infer<typeof IpcInvokeHandlerSchema>;
export type IpcCancel = z.infer<typeof IpcCancelSchema>;
export type IpcPing = z.infer<typeof IpcPingSchema>;
export type IpcControlMessage = z.infer<typeof IpcControlMessageSchema>;

export type IpcAck = z.infer<typeof IpcAckSchema>;
export type IpcResult = z.infer<typeof IpcResultSchema>;
export type IpcError = z.infer<typeof IpcErrorSchema>;
export type IpcPong = z.infer<typeof IpcPongSchema>;
export type IpcEventMessage = z.infer<typeof IpcEventMessageSchema>;

// Note: StreamKind is defined in ipc-codec.ts for binary frames.
