import type { FastifyInstance } from "fastify";
import type { fastifyCookie as FastifyCookieNamespace } from "@fastify/cookie";
import { z } from "zod";

import { PASSWORD_COOKIE_NAME } from "../auth/password.js";

const DEFAULT_KERNEL_TIMEOUT_MS = 10_000;
const ThemeSchema = z.enum(["light", "dark"]);

type Theme = z.infer<typeof ThemeSchema>;

const SettingsUpdateSchema = z
  .object({
    theme: ThemeSchema.optional(),
    kernelTimeoutMs: z
      .number({ invalid_type_error: "Kernel timeout must be a number" })
      .int()
      .min(1_000, { message: "Kernel timeout must be at least 1000ms" })
      .max(600_000, {
        message: "Kernel timeout must be 10 minutes (600000ms) or less",
      })
      .optional(),
    password: z.union([z.string(), z.null()]).optional(),
  })
  .strict();

const parseTheme = (raw?: string | null): Theme => {
  return raw === "dark" ? "dark" : "light";
};

const parseKernelTimeout = (raw?: string | null): number => {
  if (!raw) {
    return DEFAULT_KERNEL_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_KERNEL_TIMEOUT_MS;
  }
  return parsed;
};

const resolveSettingsPayload = (options: RegisterSettingsRoutesOptions) => {
  return {
    theme: parseTheme(process.env.NODEBOOKS_THEME),
    kernelTimeoutMs: parseKernelTimeout(
      process.env.NODEBOOKS_KERNEL_TIMEOUT_MS
    ),
    passwordEnabled: options.getPasswordToken() !== null,
  };
};

export interface RegisterSettingsRoutesOptions {
  getPasswordToken: () => string | null;
  setPassword: (password: string | null) => string | null;
  cookieOptions: FastifyCookieNamespace.CookieSerializeOptions;
}

export const registerSettingsRoutes = async (
  app: FastifyInstance,
  options: RegisterSettingsRoutesOptions
) => {
  app.get("/settings", async (_request, _reply) => {
    return { data: resolveSettingsPayload(options) };
  });

  app.put("/settings", async (request, reply) => {
    const result = SettingsUpdateSchema.safeParse(request.body ?? {});
    if (!result.success) {
      reply.code(400);
      return { error: "Invalid settings payload" };
    }

    const { theme, kernelTimeoutMs, password } = result.data;

    if (theme) {
      process.env.NODEBOOKS_THEME = theme;
    }

    if (kernelTimeoutMs !== undefined) {
      process.env.NODEBOOKS_KERNEL_TIMEOUT_MS = String(kernelTimeoutMs);
    }

    if (password !== undefined) {
      let normalized: string | null = null;
      if (typeof password === "string") {
        const trimmed = password.trim();
        normalized = trimmed.length > 0 ? trimmed : null;
      }
      const nextToken = options.setPassword(normalized);

      if (nextToken) {
        reply.setCookie(
          PASSWORD_COOKIE_NAME,
          nextToken,
          options.cookieOptions
        );
      } else {
        reply.clearCookie(PASSWORD_COOKIE_NAME, options.cookieOptions);
      }
    }

    return { data: resolveSettingsPayload(options) };
  });
};

