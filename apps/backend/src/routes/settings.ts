import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { SettingsService, SettingsUpdate } from "../settings/service.js";
import type { PluginSettingsManager } from "../settings/plugins.js";
import { ensureAdmin } from "../notebooks/permissions.js";
import {
  discoverOfficialPlugins,
  discoverThirdPartyPlugins,
  loadPluginFromPath,
} from "@nodebooks/plugin-engine";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

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
  pluginSettings: PluginSettingsManager;
}

export const registerSettingsRoutes = async (
  app: FastifyInstance,
  options: RegisterSettingsRoutesOptions
) => {
  app.get("/settings", async (_request, _reply) => {
    if (!ensureAdmin(_request, _reply)) {
      return;
    }
    return { data: options.settings.getSnapshot() };
  });

  app.put("/settings", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }
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

  // Plugin management endpoints
  app.get("/settings/plugins", async (_request, _reply) => {
    if (!ensureAdmin(_request, _reply)) {
      return;
    }

    const repoRoot = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../.."
    );
    const packagesPath = join(repoRoot, "packages");
    const nodeModulesPath = join(repoRoot, "node_modules");

    // Discover official plugins
    const officialPluginPaths = await discoverOfficialPlugins(packagesPath);
    const installedPlugins = await options.pluginSettings.getInstalledPlugins();
    const thirdPartyPluginPaths = await discoverThirdPartyPlugins(
      nodeModulesPath,
      installedPlugins
    );

    const allPlugins: Array<{
      id: string;
      version: string;
      name: string;
      description?: string;
      author?: string;
      homepage?: string;
      enabled: boolean;
      installed: boolean;
      official: boolean;
      cellTypes: Array<{
        type: string;
        name: string;
        enabled: boolean;
      }>;
    }> = [];

    // Load official plugins
    for (const pluginPath of officialPluginPaths) {
      try {
        const distIndexPath = join(pluginPath, "dist/index.js");
        const srcIndexPath = join(pluginPath, "src/index.ts");
        const indexPath = existsSync(distIndexPath)
          ? distIndexPath
          : srcIndexPath;
        const plugin = await loadPluginFromPath(indexPath);
        if (plugin) {
          const enabled = await options.pluginSettings.getPluginEnabled(
            plugin.id
          );
          allPlugins.push({
            id: plugin.id,
            version: plugin.version,
            name: plugin.metadata.name,
            description: plugin.metadata.description,
            author: plugin.metadata.author,
            homepage: plugin.metadata.homepage,
            enabled,
            installed: true,
            official: true,
            cellTypes: plugin.cells.map((cell) => {
              const enabled =
                typeof cell.enabled === "function"
                  ? cell.enabled()
                  : (cell.enabled ?? true);
              return {
                type: cell.type,
                name: cell.metadata.name,
                enabled: Boolean(enabled),
              };
            }),
          });
        }
      } catch (error) {
        _reply.log.warn(
          { path: pluginPath, error },
          "Failed to load plugin info"
        );
      }
    }

    // Load third-party plugins
    for (const pluginPath of thirdPartyPluginPaths) {
      try {
        const distIndexPath = join(pluginPath, "dist/index.js");
        const srcIndexPath = join(pluginPath, "src/index.ts");
        const indexPath = existsSync(distIndexPath)
          ? distIndexPath
          : srcIndexPath;
        const plugin = await loadPluginFromPath(indexPath);
        if (plugin) {
          const enabled = await options.pluginSettings.getPluginEnabled(
            plugin.id
          );
          allPlugins.push({
            id: plugin.id,
            version: plugin.version,
            name: plugin.metadata.name,
            description: plugin.metadata.description,
            author: plugin.metadata.author,
            homepage: plugin.metadata.homepage,
            enabled,
            installed: true,
            official: false,
            cellTypes: plugin.cells.map((cell) => {
              const enabled =
                typeof cell.enabled === "function"
                  ? cell.enabled()
                  : (cell.enabled ?? true);
              return {
                type: cell.type,
                name: cell.metadata.name,
                enabled: Boolean(enabled),
              };
            }),
          });
        }
      } catch (error) {
        _reply.log.warn(
          { path: pluginPath, error },
          "Failed to load plugin info"
        );
      }
    }

    return { data: allPlugins };
  });

  app.post("/settings/plugins/install", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }

    const InstallPluginSchema = z.object({
      packageName: z.string().min(1),
    });

    const result = InstallPluginSchema.safeParse(request.body ?? {});
    if (!result.success) {
      reply.code(400);
      return { error: "Invalid plugin package name" };
    }

    const { packageName } = result.data;

    // Validate package name format
    if (
      !packageName.startsWith("@nodebooks/") ||
      !packageName.includes("-cell")
    ) {
      reply.code(400);
      return {
        error: "Invalid plugin package name. Must be @nodebooks/*-cell*",
      };
    }

    // For now, we'll just track it in settings
    // In the future, this could trigger npm/pnpm install
    await options.pluginSettings.addInstalledPlugin(packageName);

    reply.code(201);
    return { data: { packageName, installed: true } };
  });

  app.delete("/settings/plugins/:packageName", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }

    // URL decode the package name to handle @nodebooks/plugin-name format
    const packageName = decodeURIComponent(
      (request.params as { packageName: string }).packageName
    );

    // Validate package name format
    if (
      !packageName.startsWith("@nodebooks/") ||
      !packageName.includes("-cell")
    ) {
      reply.code(400);
      return { error: "Invalid plugin package name" };
    }

    await options.pluginSettings.removeInstalledPlugin(packageName);

    // For now, we just remove from settings
    // In the future, this could trigger npm/pnpm uninstall

    return { data: { packageName, removed: true } };
  });

  app.post("/settings/plugins/enable", async (request, reply) => {
    if (!ensureAdmin(request, reply)) {
      return;
    }

    const EnablePluginSchema = z.object({
      pluginId: z.string(),
      enabled: z.boolean(),
    });

    const result = EnablePluginSchema.safeParse(request.body ?? {});
    if (!result.success) {
      reply.code(400);
      return { error: "Invalid request body" };
    }

    const { pluginId, enabled } = result.data;
    await options.pluginSettings.setPluginEnabled(pluginId, enabled);

    return { data: { pluginId, enabled } };
  });
};
