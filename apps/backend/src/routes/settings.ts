import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { SettingsService, SettingsUpdate } from "../settings/service.js";

const ThemeSchema = z.enum(["light", "dark"]);

const AiProviderSchema = z.enum(["openai", "heroku"]);

const AiOpenAiSchema = z
  .object({
    model: z.string().min(1, { message: "Model is required" }),
    apiKey: z.string().min(1, { message: "API key is required" }),
  })
  .partial()
  .optional();

const AiHerokuSchema = z
  .object({
    modelId: z.string().min(1, { message: "Model ID is required" }),
    inferenceKey: z.string().min(1, { message: "Inference key is required" }),
    inferenceUrl: z.string().url({ message: "Inference URL must be valid" }),
  })
  .partial()
  .optional();

const AiSettingsSchema = z
  .object({
    provider: AiProviderSchema,
    openai: AiOpenAiSchema,
    heroku: AiHerokuSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.provider === "openai") {
      const model = value.openai?.model?.trim();
      const apiKey = value.openai?.apiKey?.trim();
      if (!model) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide an OpenAI model",
          path: ["openai", "model"],
        });
      }
      if (!apiKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide an OpenAI API key",
          path: ["openai", "apiKey"],
        });
      }
    } else {
      const modelId = value.heroku?.modelId?.trim();
      const inferenceKey = value.heroku?.inferenceKey?.trim();
      const inferenceUrl = value.heroku?.inferenceUrl?.trim();
      if (!modelId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide a Heroku model ID",
          path: ["heroku", "modelId"],
        });
      }
      if (!inferenceKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide a Heroku inference key",
          path: ["heroku", "inferenceKey"],
        });
      }
      if (!inferenceUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide a Heroku inference URL",
          path: ["heroku", "inferenceUrl"],
        });
      }
    }
  });

const SettingsUpdateSchema = z
  .object({
    theme: ThemeSchema.optional(),
    kernelTimeoutMs: z
      .number()
      .int()
      .min(1_000, { message: "Kernel timeout must be at least 1000ms" })
      .max(600_000, {
        message: "Kernel timeout must be 10 minutes (600000ms) or less",
      })
      .optional(),
    aiEnabled: z.boolean().optional(),
    ai: AiSettingsSchema.optional(),
  })
  .strict();

export interface RegisterSettingsRoutesOptions {
  settings: SettingsService;
}

export const registerSettingsRoutes = async (
  app: FastifyInstance,
  options: RegisterSettingsRoutesOptions
) => {
  app.get("/settings", async (_request, _reply) => {
    return { data: options.settings.getSnapshot() };
  });

  app.put("/settings", async (request, reply) => {
    const result = SettingsUpdateSchema.safeParse(request.body ?? {});
    if (!result.success) {
      reply.code(400);
      return { error: "Invalid settings payload" };
    }

    const { theme, kernelTimeoutMs, ai, aiEnabled } = result.data;
    const updates: SettingsUpdate = {};
    if (theme !== undefined) {
      updates.theme = theme;
    }
    if (kernelTimeoutMs !== undefined) {
      updates.kernelTimeoutMs = kernelTimeoutMs;
    }
    if (aiEnabled !== undefined) {
      updates.aiEnabled = aiEnabled;
    }
    if (ai !== undefined) {
      updates.ai = ai;
    }

    let snapshot = options.settings.getSnapshot();
    if (Object.keys(updates).length > 0) {
      snapshot = await options.settings.apply(updates);
    }

    return { data: snapshot };
  });
};
