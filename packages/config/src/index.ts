import { z } from "zod";
import type {
  AiConfig,
  ClientConfig,
  GlobalSettings,
  PersistenceDriver,
  RuntimeConfig,
  ServerConfig,
} from "./types.js";

declare global {
  var __NODEBOOKS_SETTINGS__: Partial<GlobalSettings> | undefined;
}

const bool = (v: string | undefined, fallback: boolean): boolean => {
  if (v == null) return fallback;
  const s = v.toLowerCase().trim();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
};

const num = (v: string | undefined): number | undefined => {
  if (v == null) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
};

const persistenceSchema = z.object({
  driver: z
    .union([z.literal("sqlite"), z.literal("postgres"), z.literal("memory")])
    .default("sqlite") as z.ZodType<PersistenceDriver>,
  sqlitePath: z.string().optional(),
  databaseUrl: z.string().optional(),
});

const getRuntimeOverrides = (): Partial<GlobalSettings> => {
  try {
    const runtime = globalThis as typeof globalThis & {
      __NODEBOOKS_SETTINGS__?: Partial<GlobalSettings>;
    };
    const overrides = runtime.__NODEBOOKS_SETTINGS__;
    return overrides && typeof overrides === "object" ? overrides : {};
  } catch {
    return {};
  }
};

const sanitizeKernelTimeout = (value: unknown): number | undefined => {
  if (typeof value !== "number") {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const clamped = Math.min(Math.max(Math.trunc(value), 1_000), 600_000);
  return clamped;
};

const isThemeMode = (value: unknown): value is "light" | "dark" => {
  return value === "light" || value === "dark";
};

const sanitizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export function loadServerConfig(
  env: NodeJS.ProcessEnv | undefined = process.env,
  overrides?: Partial<GlobalSettings>
): ServerConfig {
  const resolvedEnv = env ?? process.env;
  const isProd = resolvedEnv.NODE_ENV === "production";
  const isDev = !isProd;

  const driver =
    (resolvedEnv.NODEBOOKS_PERSISTENCE as PersistenceDriver | undefined) ??
    "sqlite";

  const persistence = persistenceSchema.parse({
    driver,
    sqlitePath: resolvedEnv.NODEBOOKS_SQLITE_PATH ?? ".data/nodebooks.sqlite", // let store provide its internal default
    databaseUrl: resolvedEnv.DATABASE_URL,
  });

  const runtimeOverrides = {
    ...getRuntimeOverrides(),
    ...(overrides ?? {}),
  };
  const themeOverride = runtimeOverrides.theme;
  const theme = isThemeMode(themeOverride)
    ? themeOverride
    : resolvedEnv.NODEBOOKS_THEME === "dark"
      ? "dark"
      : "light";

  const kernelTimeoutOverride = sanitizeKernelTimeout(
    runtimeOverrides.kernelTimeoutMs
  );
  const kernelTimeoutMs =
    kernelTimeoutOverride ??
    num(resolvedEnv.NODEBOOKS_KERNEL_TIMEOUT_MS) ??
    10_000;
  const kernelWsHeartbeatMs = num(resolvedEnv.NODEBOOKS_KERNEL_WS_HEARTBEAT_MS);

  const runtimeAi = runtimeOverrides.ai ?? {};
  const runtimeAiEnabled =
    typeof runtimeOverrides.aiEnabled === "boolean"
      ? runtimeOverrides.aiEnabled
      : undefined;
  const envProvider = (
    resolvedEnv.NODEBOOKS_AI_PROVIDER ?? "openai"
  ).toLowerCase();
  const provider =
    runtimeAi.provider === "heroku" || runtimeAi.provider === "openai"
      ? runtimeAi.provider
      : envProvider === "heroku"
        ? "heroku"
        : "openai";

  const aiEnabled =
    runtimeAiEnabled ?? bool(resolvedEnv.NODEBOOKS_AI_ENABLED, false);

  const openaiModelOverride =
    sanitizeString(runtimeAi.openai?.model) ??
    sanitizeString(resolvedEnv.NODEBOOKS_OPENAI_MODEL);
  const openaiModel = openaiModelOverride ?? "gpt-4o-mini";
  const openaiApiKey =
    sanitizeString(runtimeAi.openai?.apiKey) ??
    sanitizeString(resolvedEnv.NODEBOOKS_OPENAI_API_KEY) ??
    sanitizeString(resolvedEnv.OPENAI_API_KEY);

  const herokuModelId =
    sanitizeString(runtimeAi.heroku?.modelId) ??
    sanitizeString(resolvedEnv.NODEBOOKS_HEROKU_MODEL_ID);
  const herokuInferenceKey =
    sanitizeString(runtimeAi.heroku?.inferenceKey) ??
    sanitizeString(resolvedEnv.NODEBOOKS_HEROKU_INFERENCE_KEY);
  const herokuInferenceUrl =
    sanitizeString(runtimeAi.heroku?.inferenceUrl) ??
    sanitizeString(resolvedEnv.NODEBOOKS_HEROKU_INFERENCE_URL);

  const ai: AiConfig = {
    enabled: aiEnabled,
    provider,
    openai: {
      model: openaiModel,
      apiKey: openaiApiKey,
    },
    heroku:
      herokuModelId || herokuInferenceKey || herokuInferenceUrl
        ? {
            modelId: herokuModelId,
            inferenceKey: herokuInferenceKey,
            inferenceUrl: herokuInferenceUrl,
          }
        : undefined,
  };

  return {
    host: resolvedEnv.HOST ?? "0.0.0.0",
    port: Number.parseInt(resolvedEnv.PORT ?? "4000", 10),
    isDev,
    isProd,
    embedNext: bool(resolvedEnv.EMBED_NEXT, true),
    keepClientCwd: bool(resolvedEnv.NEXT_KEEP_CLIENT_CWD, true),
    theme,
    kernelTimeoutMs,
    kernelWsHeartbeatMs,
    persistence,
    ai,
  } satisfies ServerConfig;
}

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv | undefined = process.env,
  overrides?: Partial<GlobalSettings>
): RuntimeConfig {
  const resolvedEnv = env ?? process.env;
  const runtimeOverrides = {
    ...getRuntimeOverrides(),
    ...(overrides ?? {}),
  };
  const kernelTimeoutOverride = sanitizeKernelTimeout(
    runtimeOverrides.kernelTimeoutMs
  );
  return {
    kernelTimeoutMs:
      kernelTimeoutOverride ??
      num(resolvedEnv.NODEBOOKS_KERNEL_TIMEOUT_MS) ??
      10_000,
    batchMs: num(resolvedEnv.NODEBOOKS_BATCH_MS) ?? 25,
  } satisfies RuntimeConfig;
}

// Client-safe accessor for NEXT_PUBLIC_* variables that might also run on the server.
export function loadClientConfig(
  env: NodeJS.ProcessEnv = process.env
): ClientConfig {
  return {
    siteUrl: env.NEXT_PUBLIC_SITE_URL,
    apiBaseUrl: env.NEXT_PUBLIC_API_BASE_URL ?? "/api",
  } satisfies ClientConfig;
}

export type {
  ServerConfig,
  ClientConfig,
  RuntimeConfig,
  PersistenceDriver,
  GlobalSettings,
};
