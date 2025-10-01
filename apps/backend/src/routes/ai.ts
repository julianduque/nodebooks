import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { loadServerConfig } from "@nodebooks/config";
import { ChatOpenAI } from "@langchain/openai";
import { ChatHeroku } from "heroku-langchain";
import {
  HumanMessage,
  SystemMessage,
  type AIMessageChunk,
} from "@langchain/core/messages";

import type { SettingsService } from "../settings/service.js";

const BodySchema = z
  .object({
    cellType: z.enum(["markdown", "code"]),
    prompt: z.string().min(1),
    language: z.string().optional(),
  })
  .strict();

const MARKDOWN_SYSTEM_PROMPT =
  "You are an expert technical writer crafting GitHub Flavored Markdown (GFM) for NodeBooks. " +
  "Produce polished documentation that follows Markdown best practices and use Mermaid diagrams when helpful. " +
  "Respond with Markdown content only.";

const CODE_SYSTEM_PROMPT =
  "You are an expert TypeScript and Node.js developer working inside a NodeBooks code cell. " +
  "Generate runnable code targeting modern Node 20 runtimes. When building UI, leverage the UiComponents available " +
  "from '@nodebooks/notebook-ui' and follow their recommended usage. Return only executable code without commentary.";

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

export interface RegisterAiRoutesOptions {
  settings: SettingsService;
}

export const registerAiRoutes = async (
  app: FastifyInstance,
  options: RegisterAiRoutesOptions
) => {
  app.post("/ai/generate", async (request, reply) => {
    const result = BodySchema.safeParse(request.body ?? {});
    if (!result.success) {
      reply.code(400);
      return { error: "Invalid AI request" };
    }

    const { cellType, prompt, language } = result.data;

    const cfg = loadServerConfig(undefined, options.settings.getSettings());
    const provider = cfg.ai.provider ?? "openai";

    const systemPrompt =
      cellType === "markdown" ? MARKDOWN_SYSTEM_PROMPT : CODE_SYSTEM_PROMPT;
    const userPrompt =
      cellType === "code" && language
        ? `${prompt}\n\nTarget language: ${language}`
        : prompt;

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ];

    if (provider === "openai") {
      const openai = cfg.ai.openai;
      if (!openai?.apiKey) {
        reply.code(400);
        return { error: "OpenAI provider is not configured." };
      }
      const model = new ChatOpenAI({
        apiKey: openai.apiKey,
        model: openai.model ?? "gpt-4o-mini",
        streaming: true,
      });

      await streamResponse(request, reply, async () => model.stream(messages));
      return reply;
    }

    const heroku = cfg.ai.heroku;
    if (!heroku?.modelId || !heroku.inferenceKey || !heroku.inferenceUrl) {
      reply.code(400);
      return { error: "Heroku AI provider is not configured." };
    }

    const model = new ChatHeroku({
      model: heroku.modelId,
      apiKey: heroku.inferenceKey,
      apiUrl: heroku.inferenceUrl,
      streaming: true,
    });

    await streamResponse(request, reply, async () => model.stream(messages));
    return reply;
  });
};

const streamResponse = async (
  request: FastifyRequest,
  reply: FastifyReply,
  getStream: () => Promise<AsyncIterable<AIMessageChunk>>
) => {
  try {
    const stream = await getStream();
    reply.raw.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    });
    if (typeof reply.raw.flushHeaders === "function") {
      reply.raw.flushHeaders();
    }

    for await (const chunk of stream) {
      if (request.raw.destroyed) {
        break;
      }
      const text = extractChunkText(chunk);
      if (text.length === 0) {
        continue;
      }
      reply.raw.write(text);
    }
  } catch (error) {
    request.log.error({ err: error }, "AI generation failed");
    if (!reply.raw.headersSent) {
      reply.code(500);
      reply.send({ error: "Failed to generate content" });
      return;
    }
    reply.raw.destroy(
      error instanceof Error ? error : new Error(String(error))
    );
    return;
  }

  reply.raw.end();
};
