import { z } from "zod";
import type {
  ClientConfig,
  PersistenceDriver,
  RuntimeConfig,
  ServerConfig,
} from "./types.js";

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

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env
): ServerConfig {
  const isProd = env.NODE_ENV === "production";
  const isDev = !isProd;

  const driver =
    (env.NODEBOOKS_PERSISTENCE as PersistenceDriver | undefined) ?? "sqlite";

  const persistence = persistenceSchema.parse({
    driver,
    sqlitePath: env.NODEBOOKS_SQLITE_PATH ?? ".data/nodebooks.sqlite", // let store provide its internal default
    databaseUrl: env.DATABASE_URL,
  });

  const theme = env.NODEBOOKS_THEME === "dark" ? "dark" : "light";

  const kernelTimeoutMs = num(env.NODEBOOKS_KERNEL_TIMEOUT_MS) ?? 10_000;
  const kernelWsHeartbeatMs = num(env.KERNEL_WS_HEARTBEAT_MS);

  const templatesDir = env.NODEBOOKS_TEMPLATE_DIR;

  return {
    host: env.HOST ?? "0.0.0.0",
    port: Number.parseInt(env.PORT ?? "4000", 10),
    isDev,
    isProd,
    embedNext: bool(env.EMBED_NEXT, true),
    keepClientCwd: bool(env.NEXT_KEEP_CLIENT_CWD, true),
    password: env.NODEBOOKS_PASSWORD,
    theme,
    kernelTimeoutMs,
    kernelWsHeartbeatMs,
    persistence,
    templatesDir,
  } satisfies ServerConfig;
}

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): RuntimeConfig {
  return {
    kernelTimeoutMs: num(env.NODEBOOKS_KERNEL_TIMEOUT_MS) ?? 10_000,
    batchMs: num(env.NODEBOOKS_BATCH_MS) ?? 25,
    debug: env.NODEBOOKS_DEBUG === "1",
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

export type { ServerConfig, ClientConfig, RuntimeConfig, PersistenceDriver };
