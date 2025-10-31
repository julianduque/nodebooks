import { z } from "zod";

/**
 * Message schema for multi-turn conversations (compatible with AI SDK UIMessage format)
 */
export const AiCellMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  id: z.string().optional(),
  timestamp: z.string().optional(),
});

export type AiCellMessage = z.infer<typeof AiCellMessageSchema>;

/**
 * AI cell response usage schema - token counts and metrics.
 */
const AiCellResponseUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional(),
  })
  .strict()
  .partial();

/**
 * AI cell response schema - output from AI model.
 */
export const AiCellResponseSchema = z
  .object({
    text: z.string().default(""),
    model: z.string().optional(),
    finishReason: z.string().optional(),
    timestamp: z.string().optional(),
    usage: AiCellResponseUsageSchema.optional(),
    costUsd: z.number().nonnegative().optional(),
    error: z.string().optional(),
    raw: z.unknown().optional(),
  })
  .strict()
  .partial();

export type AiCellResponse = z.infer<typeof AiCellResponseSchema>;

/**
 * AI cell schema - Generate text using AI models.
 */
export const AiCellSchema = z.object({
  id: z.string(),
  type: z.literal("ai"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  messages: z.array(AiCellMessageSchema).default([]),
  prompt: z.string().default(""),
  system: z.string().default(""),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  response: AiCellResponseSchema.optional(),
});

export type AiCell = z.infer<typeof AiCellSchema>;

const createId = (): string => {
  if (
    typeof globalThis.crypto !== "undefined" &&
    "randomUUID" in globalThis.crypto
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `nb_${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Factory function to create a new AI cell.
 */
export const createAiCell = (partial?: Partial<AiCell>): AiCell => {
  return AiCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "ai",
    metadata: partial?.metadata ?? {},
    messages: partial?.messages ?? [],
    prompt: partial?.prompt ?? "",
    system: partial?.system ?? "",
    model: partial?.model,
    temperature: partial?.temperature,
    maxTokens: partial?.maxTokens,
    topP: partial?.topP,
    frequencyPenalty: partial?.frequencyPenalty,
    presencePenalty: partial?.presencePenalty,
    response: partial?.response,
  });
};

/**
 * AI cell file schema - For notebook file serialization.
 */
export const NotebookFileAiCellSchema = z.object({
  type: z.literal("ai"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  messages: z.array(AiCellMessageSchema).optional(),
  prompt: z.string().optional(),
  system: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  response: AiCellResponseSchema.optional(),
});
export type NotebookFileAiCell = z.infer<typeof NotebookFileAiCellSchema>;
