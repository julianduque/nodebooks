import type { FastifyInstance } from "fastify";
import type * as FastifyCookieNamespace from "@fastify/cookie";
import { z } from "zod";

import { PASSWORD_COOKIE_NAME } from "../auth/password.js";
import type { SettingsService, SettingsUpdate } from "../settings/service.js";

const ThemeSchema = z.enum(["light", "dark"]);

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
    password: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

export interface RegisterSettingsRoutesOptions {
  settings: SettingsService;
  cookieOptions: FastifyCookieNamespace.CookieSerializeOptions;
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

    const { theme, kernelTimeoutMs, password } = result.data;
    const updates: SettingsUpdate = {};
    if (theme !== undefined) {
      updates.theme = theme;
    }
    if (kernelTimeoutMs !== undefined) {
      updates.kernelTimeoutMs = kernelTimeoutMs;
    }
    if (password !== undefined) {
      updates.password = password;
    }

    let snapshot = options.settings.getSnapshot();
    if (Object.keys(updates).length > 0) {
      snapshot = await options.settings.apply(updates);
    }

    if (password !== undefined) {
      const nextToken = options.settings.getPasswordToken();
      if (nextToken) {
        reply.setCookie(PASSWORD_COOKIE_NAME, nextToken, options.cookieOptions);
        request.log.info("Password protection enabled");
      } else {
        reply.clearCookie(PASSWORD_COOKIE_NAME, options.cookieOptions);
        request.log.info("Password protection disabled");
      }
    }

    return { data: snapshot };
  });
};
