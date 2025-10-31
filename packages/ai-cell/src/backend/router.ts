import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadServerConfig } from "@nodebooks/config";
import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
// Settings service interface - will be passed from backend
interface SettingsService {
  getSettings(): Record<string, unknown>;
}

const AiCellRequestSchema = z.object({
  messages: z.array(z.any()), // Message array from useChat
  system: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
});

export interface RegisterAiCellRoutesOptions {
  settings: SettingsService;
}

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
      messages,
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

    // Validate messages array
    if (!Array.isArray(messages) || messages.length === 0) {
      reply.code(400);
      return {
        error: "Request must include a non-empty messages array.",
      };
    }

    const trimmedSystem = (system ?? "").trim();

    try {
      const provider = cfg.ai.provider ?? "openai";
      let modelInstance;
      let resolvedModel: string;

      if (provider === "openai") {
        const openaiConfig = cfg.ai.openai;
        if (!openaiConfig?.apiKey) {
          request.log.warn(
            "AI cell request failed: missing OpenAI credentials"
          );
          reply.code(500);
          return { error: "AI assistant is not configured for OpenAI." };
        }
        const modelBase = model ?? openaiConfig.model ?? "gpt-4o-mini";
        resolvedModel = modelBase.trim() || openaiConfig.model || "gpt-4o-mini";

        const openai = createOpenAI({
          apiKey: openaiConfig.apiKey,
        });
        modelInstance = openai(resolvedModel);
      } else {
        const herokuConfig = cfg.ai.heroku;
        if (
          !herokuConfig?.modelId ||
          !herokuConfig.inferenceKey ||
          !herokuConfig.inferenceUrl
        ) {
          request.log.warn(
            "AI cell request failed: missing Heroku credentials"
          );
          reply.code(500);
          return { error: "AI assistant is not configured for Heroku AI." };
        }
        const modelBase = model ?? herokuConfig.modelId;
        resolvedModel = modelBase.trim() || herokuConfig.modelId;

        try {
          // Dynamic import to avoid triggering heroku-ai-provider's top-level initialization
          const { createHerokuAI } = await import("heroku-ai-provider");
          const heroku = createHerokuAI({
            chatApiKey: herokuConfig.inferenceKey,
            chatBaseUrl: herokuConfig.inferenceUrl,
          });
          modelInstance = heroku.chat(resolvedModel);
        } catch (error) {
          request.log.error(
            { err: error },
            "Failed to create Heroku AI provider"
          );
          reply.code(500);
          return {
            error:
              "Failed to initialize Heroku AI provider. Check credentials.",
          };
        }
      }

      // Build stream options dynamically
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const streamOptions: any = {
        model: modelInstance,
        system: trimmedSystem || undefined,
        messages: messages, // useChat sends messages in the correct format
        temperature,
        topP,
        frequencyPenalty,
        presencePenalty,
      };

      // Add maxTokens if provided (use maxTokens for compatibility)
      if (maxTokens !== undefined) {
        streamOptions.maxTokens = maxTokens;
      }

      const result = streamText(streamOptions);

      // Get the final result with usage information
      let finalUsage:
        | {
            promptTokens?: number;
            completionTokens?: number;
            totalTokens?: number;
          }
        | undefined;
      let finalModel: string | undefined;
      let finalFinishReason: string | undefined;

      // Stream the text and capture metadata
      reply.header("Content-Type", "text/event-stream");
      reply.header("Cache-Control", "no-cache");
      reply.header("Connection", "keep-alive");

      // Create a text encoder for streaming
      const encoder = new TextEncoder();

      try {
        for await (const chunk of result.textStream) {
          // Stream text chunks
          reply.raw.write(encoder.encode(chunk));
        }

        // After stream completes, get usage information
        const usage = await result.usage;
        const finishReason = await result.finishReason;

        if (usage) {
          const usageAny = usage as unknown as {
            promptTokens?: number;
            completionTokens?: number;
          };
          finalUsage = {
            promptTokens:
              usageAny.promptTokens ?? usage.inputTokens ?? undefined,
            completionTokens:
              usageAny.completionTokens ?? usage.outputTokens ?? undefined,
            totalTokens: usage.totalTokens ?? undefined,
          };
        }

        if (finishReason) {
          finalFinishReason = finishReason;
        }

        // Model is already resolved from the request
        finalModel = resolvedModel;

        // Send metadata as a special marker at the end
        const metadata = {
          __metadata: true,
          usage: finalUsage,
          model: finalModel || resolvedModel,
          finishReason: finalFinishReason,
        };
        reply.raw.write(
          encoder.encode(`\n__METADATA__:${JSON.stringify(metadata)}\n`)
        );
        reply.raw.end();
        return reply;
      } catch (streamError) {
        request.log.error({ err: streamError }, "Error during streaming");
        if (!reply.raw.headersSent) {
          reply.code(500);
          return { error: "Stream processing failed" };
        }
        reply.raw.end();
        return reply;
      }
    } catch (error) {
      request.log.error({ err: error }, "AI cell request failed");

      // Try to send error as stream if headers already sent
      if (reply.raw.headersSent) {
        const errorLine =
          JSON.stringify({
            type: "error",
            error:
              error instanceof Error
                ? error.message
                : "Failed to generate content",
          }) + "\n";
        reply.raw.write(errorLine);
        reply.raw.end();
        return reply;
      }

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
