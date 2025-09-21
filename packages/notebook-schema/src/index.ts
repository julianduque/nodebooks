import { z } from "zod";

const createId = () => {
  if (
    typeof globalThis.crypto !== "undefined" &&
    "randomUUID" in globalThis.crypto
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `nb_${Math.random().toString(36).slice(2, 10)}`;
};

export const OutputExecutionSchema = z.object({
  started: z.number().nonnegative(),
  ended: z.number().nonnegative(),
  status: z.enum(["ok", "error", "aborted"]).default("ok"),
  error: z
    .object({
      name: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
});

export const StreamOutputSchema = z.object({
  type: z.literal("stream"),
  name: z.enum(["stdout", "stderr"]),
  text: z.string(),
});

export const DisplayDataSchema = z.object({
  type: z.enum(["display_data", "execute_result", "update_display_data"]),
  data: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ErrorOutputSchema = z.object({
  type: z.literal("error"),
  ename: z.string(),
  evalue: z.string(),
  traceback: z.array(z.string()).default([]),
});

export const NotebookOutputSchema = z.discriminatedUnion("type", [
  StreamOutputSchema,
  DisplayDataSchema,
  ErrorOutputSchema,
]);

export const MarkdownCellSchema = z.object({
  id: z.string(),
  type: z.literal("markdown"),
  source: z.string().default(""),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const CodeCellSchema = z.object({
  id: z.string(),
  type: z.literal("code"),
  language: z.enum(["js", "ts"]).default("js"),
  source: z.string().default(""),
  metadata: z
    .object({
      timeoutMs: z.number().int().positive().max(600_000).optional(),
      display: z.record(z.string(), z.unknown()).optional(),
    })
    .default({}),
  outputs: z.array(NotebookOutputSchema).default([]),
  execution: OutputExecutionSchema.optional(),
});

export const NotebookCellSchema = z.discriminatedUnion("type", [
  MarkdownCellSchema,
  CodeCellSchema,
]);

export const NotebookEnvSchema = z.object({
  runtime: z.enum(["node", "bun"]).default("node"),
  version: z.string().default("20.x"),
  packages: z.record(z.string(), z.string()).default({}),
  // Key-value environment variables available to code cells via process.env
  variables: z.record(z.string(), z.string()).default({}),
});

export const NotebookSchema = z.object({
  id: z.string(),
  name: z.string(),
  env: NotebookEnvSchema,
  cells: z.array(NotebookCellSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Notebook = z.infer<typeof NotebookSchema>;
export type NotebookCell = z.infer<typeof NotebookCellSchema>;
export type NotebookEnv = z.infer<typeof NotebookEnvSchema>;
export type CodeCell = z.infer<typeof CodeCellSchema>;
export type MarkdownCell = z.infer<typeof MarkdownCellSchema>;
export type NotebookOutput = z.infer<typeof NotebookOutputSchema>;
export type StreamOutput = z.infer<typeof StreamOutputSchema>;
export type DisplayDataOutput = z.infer<typeof DisplayDataSchema>;
export type ErrorOutput = z.infer<typeof ErrorOutputSchema>;
export type OutputExecution = z.infer<typeof OutputExecutionSchema>;

export const createEmptyNotebook = (partial?: Partial<Notebook>): Notebook => {
  const now = new Date().toISOString();
  const base: Notebook = {
    id: partial?.id ?? createId(),
    name: partial?.name ?? "Untitled Notebook",
    env: NotebookEnvSchema.parse(partial?.env ?? {}),
    cells: partial?.cells ?? [],
    createdAt: partial?.createdAt ?? now,
    updatedAt: partial?.updatedAt ?? now,
  };

  return NotebookSchema.parse({ ...base, ...partial });
};

export const createCodeCell = (partial?: Partial<CodeCell>): CodeCell => {
  return CodeCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "code",
    language: partial?.language ?? "ts",
    source: partial?.source ?? "",
    metadata: partial?.metadata ?? {},
    outputs: partial?.outputs ?? [],
    execution: partial?.execution,
  });
};

export const createMarkdownCell = (
  partial?: Partial<MarkdownCell>
): MarkdownCell => {
  return MarkdownCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "markdown",
    source: partial?.source ?? "",
    metadata: partial?.metadata ?? {},
  });
};

export const KernelHelloMessageSchema = z.object({
  type: z.literal("hello"),
  notebookId: z.string(),
  sessionId: z.string(),
});

export const KernelStatusMessageSchema = z.object({
  type: z.literal("status"),
  state: z.enum(["idle", "busy"]),
});

export const KernelExecuteReplySchema = z.object({
  type: z.literal("execute_reply"),
  cellId: z.string(),
  status: z.enum(["ok", "error", "aborted"]).default("ok"),
  execTimeMs: z.number().nonnegative(),
});

export const KernelStreamMessageSchema = StreamOutputSchema.extend({
  cellId: z.string(),
});

export const KernelDisplayMessageSchema = DisplayDataSchema.extend({
  cellId: z.string(),
});

export const KernelErrorMessageSchema = ErrorOutputSchema.extend({
  cellId: z.string(),
});

export const KernelServerMessageSchema = z.discriminatedUnion("type", [
  KernelHelloMessageSchema,
  KernelStatusMessageSchema,
  KernelStreamMessageSchema,
  KernelDisplayMessageSchema,
  KernelErrorMessageSchema,
  KernelExecuteReplySchema,
]);

export const KernelExecuteRequestSchema = z.object({
  type: z.literal("execute_request"),
  cellId: z.string(),
  code: z.string(),
  language: z.enum(["js", "ts"]).default("js"),
  timeoutMs: z.number().int().positive().max(600_000).optional(),
});

export const KernelInterruptRequestSchema = z.object({
  type: z.literal("interrupt_request"),
  notebookId: z.string(),
});

export const KernelClientMessageSchema = z.discriminatedUnion("type", [
  KernelExecuteRequestSchema,
  KernelInterruptRequestSchema,
]);

export type KernelHelloMessage = z.infer<typeof KernelHelloMessageSchema>;
export type KernelStatusMessage = z.infer<typeof KernelStatusMessageSchema>;
export type KernelExecuteReplyMessage = z.infer<
  typeof KernelExecuteReplySchema
>;
export type KernelStreamMessage = z.infer<typeof KernelStreamMessageSchema>;
export type KernelDisplayMessage = z.infer<typeof KernelDisplayMessageSchema>;
export type KernelErrorMessage = z.infer<typeof KernelErrorMessageSchema>;
export type KernelServerMessage = z.infer<typeof KernelServerMessageSchema>;
export type KernelExecuteRequest = z.infer<typeof KernelExecuteRequestSchema>;
export type KernelInterruptRequest = z.infer<
  typeof KernelInterruptRequestSchema
>;
export type KernelClientMessage = z.infer<typeof KernelClientMessageSchema>;
