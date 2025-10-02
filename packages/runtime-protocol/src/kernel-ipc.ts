import { z } from "zod";
import {
  CodeCellSchema,
  NotebookEnvSchema,
  NotebookOutputSchema,
  OutputExecutionSchema,
  ShellCellSchema,
} from "@nodebooks/notebook-schema";

const IpcRunBaseSchema = z.object({
  type: z.literal("RunCell"),
  jobId: z.string(),
  notebookId: z.string(),
  env: NotebookEnvSchema,
  timeoutMs: z.number().int().positive().max(600_000).optional(),
});

const IpcRunCodeCellSchema = IpcRunBaseSchema.extend({
  cellType: z.literal("code"),
  cell: CodeCellSchema,
  code: z.string(),
});

const IpcRunShellCellSchema = IpcRunBaseSchema.extend({
  cellType: z.literal("shell"),
  cell: ShellCellSchema,
  command: z.string(),
});

export const IpcRunCellSchema = z.discriminatedUnion("cellType", [
  IpcRunCodeCellSchema,
  IpcRunShellCellSchema,
]);

export const IpcCancelSchema = z.object({
  type: z.literal("Cancel"),
  jobId: z.string(),
});

export const IpcPingSchema = z.object({
  type: z.literal("Ping"),
});

export const IpcControlMessageSchema = z.discriminatedUnion("type", [
  IpcRunCellSchema,
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
export type IpcRunCodeCell = z.infer<typeof IpcRunCodeCellSchema>;
export type IpcRunShellCell = z.infer<typeof IpcRunShellCellSchema>;
export type IpcCancel = z.infer<typeof IpcCancelSchema>;
export type IpcPing = z.infer<typeof IpcPingSchema>;
export type IpcControlMessage = z.infer<typeof IpcControlMessageSchema>;

export type IpcAck = z.infer<typeof IpcAckSchema>;
export type IpcResult = z.infer<typeof IpcResultSchema>;
export type IpcError = z.infer<typeof IpcErrorSchema>;
export type IpcPong = z.infer<typeof IpcPongSchema>;
export type IpcEventMessage = z.infer<typeof IpcEventMessageSchema>;

// Note: StreamKind is defined in ipc-codec.ts for binary frames.
