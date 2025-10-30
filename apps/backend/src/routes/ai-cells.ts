import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { loadServerConfig } from "@nodebooks/config";
import { ChatOpenAI } from "@langchain/openai";
import { ChatHeroku } from "heroku-langchain";
import {
  HumanMessage,
  SystemMessage,
  isAIMessage,
  type AIMessage,
  type AIMessageChunk,
} from "@langchain/core/messages";
import type { SettingsService } from "../settings/service.js";

const AiCellRequestSchema = z
  .object({
    prompt: z.string().min(1),
    system: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    topP: z.number().min(0).max(1).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    presencePenalty: z.number().min(-2).max(2).optional(),
  })
  .strict();

const extractChunkText = (chunk: AIMessageChunk): string => {
  const { content } = chunk;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("");
  }
  return "";
};

const resolveNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number") {
    return undefined;
  }
  return Number.isFinite(value) ? value : undefined;
};

const extractMessageText = (message: AIMessage): string => {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("");
  }
  return "";
};

const readTokenCounts = (
  message: AIMessage
): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} => {
  const usage = message.usage_metadata ?? {};
  const metadata = message.response_metadata ?? {};
  const metadataUsage = (metadata.tokenUsage ?? metadata.usage) as
    | Record<string, unknown>
    | undefined;
  const inputTokens =
    resolveNumber((usage as { input_tokens?: number }).input_tokens) ??
    resolveNumber((metadataUsage ?? {}).promptTokens) ??
    resolveNumber((metadataUsage ?? {}).prompt_tokens) ??
    resolveNumber((metadataUsage ?? {}).inputTokens) ??
    resolveNumber((metadataUsage ?? {}).input_tokens);
  const outputTokens =
    resolveNumber((usage as { output_tokens?: number }).output_tokens) ??
    resolveNumber((metadataUsage ?? {}).completionTokens) ??
    resolveNumber((metadataUsage ?? {}).completion_tokens) ??
    resolveNumber((metadataUsage ?? {}).outputTokens) ??
    resolveNumber((metadataUsage ?? {}).output_tokens);
  const totalTokens =
    resolveNumber((usage as { total_tokens?: number }).total_tokens) ??
    resolveNumber((metadataUsage ?? {}).totalTokens) ??
    resolveNumber((metadataUsage ?? {}).total_tokens);
  return { inputTokens, outputTokens, totalTokens };
};

const OPENAI_PRICING_USD_PER_1K: Record<
  string,
  { input: number; output: number }
> = {
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4.1": { input: 0.005, output: 0.015 },
  "gpt-4.1-mini": { input: 0.00015, output: 0.0006 },
};

const estimateOpenAiCost = (
  model: string,
  tokens: {
    inputTokens?: number;
    outputTokens?: number;
  }
): number | undefined => {
  const normalizedModel = model.toLowerCase();
  const pricing = Object.entries(OPENAI_PRICING_USD_PER_1K).find(([key]) =>
    normalizedModel.startsWith(key)
  )?.[1];
  if (!pricing) {
    return undefined;
  }
  const inputCost =
    tokens.inputTokens !== undefined
      ? (tokens.inputTokens / 1000) * pricing.input
      : 0;
  const outputCost =
    tokens.outputTokens !== undefined
      ? (tokens.outputTokens / 1000) * pricing.output
      : 0;
  const total = inputCost + outputCost;
  return Number.isFinite(total) ? Number(total.toFixed(6)) : undefined;
};

const normalizeAiMessage = (
  message: AIMessage,
  {
    provider,
    model,
  }: {
    provider: "openai" | "heroku";
    model: string;
  }
) => {
  const text = extractMessageText(message).trim();
  const tokens = readTokenCounts(message);
  const metadata = message.response_metadata ?? {};
  const finishReason = (() => {
    const direct = (metadata as { finish_reason?: unknown }).finish_reason;
    if (typeof direct === "string" && direct.trim().length > 0) {
      return direct;
    }
    const alt = (metadata as { finishReason?: unknown }).finishReason;
    return typeof alt === "string" && alt.trim().length > 0 ? alt : undefined;
  })();
  const responseModel = (() => {
    const direct = (metadata as { model?: unknown }).model;
    if (typeof direct === "string" && direct.trim().length > 0) {
      return direct.trim();
    }
    const alt = (metadata as { model_name?: unknown }).model_name;
    if (typeof alt === "string" && alt.trim().length > 0) {
      return alt.trim();
    }
    return model;
  })();
  const costFromMetadata = (() => {
    const usage = (metadata as { usage?: Record<string, unknown> }).usage;
    const totalCost = usage?.total_cost ?? usage?.totalCost;
    if (totalCost !== undefined) {
      return resolveNumber(totalCost);
    }
    const cost = (metadata as { cost?: unknown }).cost;
    if (typeof cost === "number") {
      return resolveNumber(cost);
    }
    const costUsd = (metadata as { costUsd?: unknown }).costUsd;
    if (typeof costUsd === "number") {
      return resolveNumber(costUsd);
    }
    return undefined;
  })();

  const inferredCost =
    costFromMetadata ??
    (provider === "openai"
      ? estimateOpenAiCost(responseModel, tokens)
      : undefined);

  return {
    text,
    model: responseModel,
    finishReason,
    timestamp: new Date().toISOString(),
    usage:
      tokens.inputTokens !== undefined ||
      tokens.outputTokens !== undefined ||
      tokens.totalTokens !== undefined
        ? {
            inputTokens: tokens.inputTokens,
            outputTokens: tokens.outputTokens,
            totalTokens: tokens.totalTokens,
          }
        : undefined,
    costUsd: inferredCost,
    raw: Object.keys(metadata).length > 0 ? metadata : undefined,
  } as const;
};

export interface RegisterAiCellRoutesOptions {
  settings: SettingsService;
}

const streamAiCellResponse = async (
  request: FastifyRequest,
  reply: FastifyReply,
  getStream: () => Promise<AsyncIterable<AIMessageChunk>>,
  {
    provider,
    model,
  }: {
    provider: "openai" | "heroku";
    model: string;
  }
) => {
  let headersSent = false;
  let producedOutput = false;
  let lastChunk: AIMessageChunk | null = null;
  let accumulatedText = "";
  const sendStreamHeaders = () => {
    if (headersSent) {
      return;
    }
    reply.raw.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    });
    if (typeof reply.raw.flushHeaders === "function") {
      reply.raw.flushHeaders();
    }
    headersSent = true;
  };

  try {
    const stream = await getStream();
    sendStreamHeaders();
    for await (const chunk of stream) {
      lastChunk = chunk;
      const text = extractChunkText(chunk);
      if (text.length === 0) {
        continue;
      }
      producedOutput = true;
      accumulatedText += text;
      const chunkLine = JSON.stringify({ type: "chunk", text }) + "\n";
      reply.raw.write(chunkLine);
    }

    // Try to extract metadata from the last chunk
    if (lastChunk && isAIMessage(lastChunk)) {
      const metadata = normalizeAiMessage(lastChunk, { provider, model });
      // Include the accumulated text in metadata
      const metadataLine =
        JSON.stringify({
          type: "done",
          metadata: {
            ...metadata,
            text: accumulatedText || metadata.text,
          },
        }) + "\n";
      reply.raw.write(metadataLine);
    } else {
      // If we can't get metadata, send what we have
      const metadataLine =
        JSON.stringify({
          type: "done",
          metadata: {
            text: accumulatedText,
            timestamp: new Date().toISOString(),
          },
        }) + "\n";
      reply.raw.write(metadataLine);
    }
  } catch (error) {
    request.log.error({ err: error }, "AI cell streaming failed");
    if (!headersSent && !reply.raw.headersSent) {
      reply.code(500);
      reply.send({ error: "Failed to generate content" });
      return;
    }
    const errorLine =
      JSON.stringify({
        type: "error",
        error:
          error instanceof Error ? error.message : "Failed to generate content",
      }) + "\n";
    reply.raw.write(errorLine);
    reply.raw.end();
    return;
  }

  if (!producedOutput) {
    if (!headersSent && !reply.raw.headersSent) {
      reply.code(500);
      reply.send({ error: "AI assistant did not return any content." });
      return;
    }
  }

  reply.raw.end();
};

export const registerAiCellRoutes = async (
  app: FastifyInstance,
  options: RegisterAiCellRoutesOptions
) => {
  app.post("/ai/cells", async (request, reply) => {
    const parsed = AiCellRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: "Invalid AI cell request" };
    }

    const {
      prompt,
      system,
      model,
      temperature,
      maxTokens,
      topP,
      frequencyPenalty,
      presencePenalty,
    } = parsed.data;
    const cfg = loadServerConfig(undefined, options.settings.getSettings());
    if (!cfg.ai.enabled) {
      reply.code(403);
      return { error: "AI assistant is disabled." };
    }

    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      reply.code(400);
      return { error: "Prompt must not be empty." };
    }
    const trimmedSystem = (system ?? "").trim();
    const messages = [] as (SystemMessage | HumanMessage)[];
    if (trimmedSystem) {
      messages.push(new SystemMessage(trimmedSystem));
    }
    messages.push(new HumanMessage(trimmedPrompt));

    try {
      if ((cfg.ai.provider ?? "openai") === "openai") {
        const openai = cfg.ai.openai;
        if (!openai?.apiKey) {
          request.log.warn(
            "AI cell request failed: missing OpenAI credentials"
          );
          reply.code(500);
          return { error: "AI assistant is not configured for OpenAI." };
        }
        const resolvedModelBase = model ?? openai.model ?? "gpt-4o-mini";
        const resolvedModel =
          resolvedModelBase.trim() || openai.model || "gpt-4o-mini";

        const clientOptions: {
          apiKey: string;
          model: string;
          streaming: boolean;
          temperature?: number;
          maxTokens?: number;
          topP?: number;
          frequencyPenalty?: number;
          presencePenalty?: number;
        } = {
          apiKey: openai.apiKey,
          model: resolvedModel,
          streaming: true,
        };
        if (temperature !== undefined) clientOptions.temperature = temperature;
        if (maxTokens !== undefined) clientOptions.maxTokens = maxTokens;
        if (topP !== undefined) clientOptions.topP = topP;
        if (frequencyPenalty !== undefined)
          clientOptions.frequencyPenalty = frequencyPenalty;
        if (presencePenalty !== undefined)
          clientOptions.presencePenalty = presencePenalty;

        const client = new ChatOpenAI(clientOptions);

        const stream = await client.stream(messages);
        await streamAiCellResponse(request, reply, async () => stream, {
          provider: "openai",
          model: resolvedModel,
        });
        return reply;
      }

      const heroku = cfg.ai.heroku;
      if (!heroku?.modelId || !heroku.inferenceKey || !heroku.inferenceUrl) {
        request.log.warn("AI cell request failed: missing Heroku credentials");
        reply.code(500);
        return { error: "AI assistant is not configured for Heroku AI." };
      }
      const resolvedModelBase = model ?? heroku.modelId;
      const resolvedModel = resolvedModelBase.trim() || heroku.modelId;

      const clientOptions: {
        model: string;
        apiKey: string;
        apiUrl: string;
        streaming: boolean;
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        frequencyPenalty?: number;
        presencePenalty?: number;
      } = {
        model: resolvedModel,
        apiKey: heroku.inferenceKey,
        apiUrl: heroku.inferenceUrl,
        streaming: true,
      };
      if (temperature !== undefined) clientOptions.temperature = temperature;
      if (maxTokens !== undefined) clientOptions.maxTokens = maxTokens;
      if (topP !== undefined) clientOptions.topP = topP;
      if (frequencyPenalty !== undefined)
        clientOptions.frequencyPenalty = frequencyPenalty;
      if (presencePenalty !== undefined)
        clientOptions.presencePenalty = presencePenalty;

      const client = new ChatHeroku(clientOptions);

      const stream = await client.stream(messages);
      await streamAiCellResponse(request, reply, async () => stream, {
        provider: "heroku",
        model: resolvedModel,
      });
      return reply;
    } catch (error) {
      request.log.error({ err: error }, "AI cell request failed");
      reply.code(500);
      return {
        error:
          error instanceof Error
            ? error.message
            : "Failed to complete AI request.",
      };
    }
  });
};
