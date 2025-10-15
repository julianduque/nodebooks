import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as TOML from "@iarna/toml";
import { z } from "zod";
import type {
  AiProvider,
  AiConfig,
  GlobalSettings,
  ThemeMode,
} from "./types.js";

const PersistenceDriverEnum = z.enum(["sqlite", "postgres"]);
const ThemeEnum = z.enum(["light", "dark"]);
const AiProviderEnum = z.enum(["openai", "heroku"]);

const AiOpenAiSchema = z
  .object({
    model: z.string().min(1).optional(),
    apiKey: z.string().min(1).optional(),
  })
  .partial()
  .strict();

const AiHerokuSchema = z
  .object({
    modelId: z.string().min(1).optional(),
    inferenceKey: z.string().min(1).optional(),
    inferenceUrl: z.string().min(1).optional(),
  })
  .partial()
  .strict();

const AiSchema = z
  .object({
    enabled: z.boolean().default(true),
    provider: AiProviderEnum.default("openai"),
    openai: AiOpenAiSchema.optional(),
    heroku: AiHerokuSchema.optional(),
  })
  .strict();

const AdminSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(1),
    passwordHash: z.string().min(1),
  })
  .strict();

const PersistenceSchema = z
  .object({
    driver: PersistenceDriverEnum,
    sqlitePath: z.string().min(1).optional(),
    databaseUrl: z.string().min(1).optional(),
  })
  .strict();

const CliConfigSchemaInternal = z
  .object({
    persistence: PersistenceSchema,
    theme: ThemeEnum.default("light"),
    ai: AiSchema,
    admin: AdminSchema,
  })
  .passthrough();

export const CliConfigSchema = CliConfigSchemaInternal;
export type CliConfig = z.infer<typeof CliConfigSchemaInternal>;

export interface SettingsWriter {
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface PrepareCliConfigResult {
  config: CliConfig;
  changed: boolean;
}

export const getCliConfigDir = (): string => {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData && appData.length > 0) {
      return path.join(appData, "nodebooks");
    }
    return path.join(os.homedir(), "AppData", "Roaming", "nodebooks");
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  const baseDir =
    xdg && xdg.length > 0
      ? path.resolve(xdg)
      : path.join(os.homedir(), ".config");
  return path.join(baseDir, "nodebooks");
};

export const getCliConfigFilePath = (): string => {
  return path.join(getCliConfigDir(), "nodebooks.toml");
};

export const getDefaultCliDataDir = (): string => {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "nodebooks"
    );
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData && appData.length > 0) {
      return path.join(appData, "nodebooks", "data");
    }
    return path.join(os.homedir(), "AppData", "Roaming", "nodebooks", "data");
  }
  const xdg = process.env.XDG_DATA_HOME;
  const baseDir =
    xdg && xdg.length > 0
      ? path.resolve(xdg)
      : path.join(os.homedir(), ".local", "share");
  return path.join(baseDir, "nodebooks");
};

export const getDefaultCliSqlitePath = (): string => {
  return path.join(getDefaultCliDataDir(), "nodebooks.sqlite");
};

const normalizeAdmin = (admin: CliConfig["admin"]): CliConfig["admin"] => {
  return {
    email: admin.email.trim().toLowerCase(),
    name: admin.name.trim(),
    passwordHash: admin.passwordHash.trim(),
  };
};

const normalizeAi = (ai: CliConfig["ai"]): CliConfig["ai"] => {
  const provider: AiProvider = ai.provider;
  const enabled = ai.enabled;
  const normalized: CliConfig["ai"] = {
    enabled,
    provider,
  };
  if (ai.openai) {
    const openai: NonNullable<CliConfig["ai"]["openai"]> = {};
    if (ai.openai.model && ai.openai.model.trim().length > 0) {
      openai.model = ai.openai.model.trim();
    }
    if (ai.openai.apiKey && ai.openai.apiKey.trim().length > 0) {
      openai.apiKey = ai.openai.apiKey.trim();
    }
    if (Object.keys(openai).length > 0) {
      normalized.openai = openai;
    }
  }
  if (ai.heroku) {
    const heroku: NonNullable<CliConfig["ai"]["heroku"]> = {};
    if (ai.heroku.modelId && ai.heroku.modelId.trim().length > 0) {
      heroku.modelId = ai.heroku.modelId.trim();
    }
    if (ai.heroku.inferenceKey && ai.heroku.inferenceKey.trim().length > 0) {
      heroku.inferenceKey = ai.heroku.inferenceKey.trim();
    }
    if (ai.heroku.inferenceUrl && ai.heroku.inferenceUrl.trim().length > 0) {
      heroku.inferenceUrl = ai.heroku.inferenceUrl.trim();
    }
    if (Object.keys(heroku).length > 0) {
      normalized.heroku = heroku;
    }
  }
  return normalized;
};

const normalizePersistence = (
  persistence: CliConfig["persistence"]
): CliConfig["persistence"] => {
  if (persistence.driver === "sqlite") {
    const sqlitePath =
      persistence.sqlitePath && persistence.sqlitePath.trim().length > 0
        ? path.resolve(persistence.sqlitePath)
        : getDefaultCliSqlitePath();
    return {
      driver: "sqlite",
      sqlitePath,
    };
  }
  return {
    driver: "postgres",
    databaseUrl: persistence.databaseUrl?.trim(),
  };
};

export const normalizeCliConfig = (config: CliConfig): CliConfig => {
  const persistence = normalizePersistence(config.persistence);
  const ai = normalizeAi(config.ai);
  const admin = normalizeAdmin(config.admin);
  const theme: ThemeMode = config.theme === "dark" ? "dark" : "light";
  return {
    persistence,
    theme,
    ai,
    admin,
  };
};

export const createDefaultCliConfig = (): CliConfig => {
  return normalizeCliConfig(
    CliConfigSchema.parse({
      persistence: { driver: "sqlite" },
      theme: "light",
      ai: {
        enabled: true,
        provider: "openai",
        openai: { model: "gpt-4o-mini" },
      },
      admin: {
        email: "admin@example.com",
        name: "Admin",
        passwordHash: "CHANGE_ME",
      },
    })
  );
};

export const prepareCliConfig = async (
  config: CliConfig
): Promise<PrepareCliConfigResult> => {
  const normalized = normalizeCliConfig(config);
  let changed = false;
  if (!configsEqual(normalized, config)) {
    changed = true;
  }

  if (
    normalized.persistence.driver === "sqlite" &&
    normalized.persistence.sqlitePath
  ) {
    await fs.mkdir(path.dirname(normalized.persistence.sqlitePath), {
      recursive: true,
    });
  }

  await fs.mkdir(getCliConfigDir(), { recursive: true });

  return { config: normalized, changed };
};

export const loadCliConfig = async (): Promise<CliConfig | null> => {
  const file = getCliConfigFilePath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = CliConfigSchema.parse(TOML.parse(raw));
    const { config } = await prepareCliConfig(parsed);
    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

export const saveCliConfig = async (config: CliConfig): Promise<CliConfig> => {
  const prepared = await prepareCliConfig(config);
  const file = getCliConfigFilePath();
  const serialized = TOML.stringify({
    persistence: serializePersistence(prepared.config.persistence),
    theme: prepared.config.theme,
    ai: serializeAi(prepared.config.ai),
    admin: {
      email: prepared.config.admin.email,
      name: prepared.config.admin.name,
      passwordHash: prepared.config.admin.passwordHash,
    },
  } as Parameters<typeof TOML.stringify>[0]);
  await fs.writeFile(file, `${serialized}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return prepared.config;
};

export const buildCliEnvironment = (
  config: CliConfig
): Record<string, string> => {
  const env: Record<string, string> = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    NODEBOOKS_THEME: config.theme,
    NODEBOOKS_PERSISTENCE: config.persistence.driver,
    NODEBOOKS_AI_ENABLED: config.ai.enabled ? "true" : "false",
    NODEBOOKS_AI_PROVIDER: config.ai.provider,
  };
  if (config.persistence.driver === "sqlite" && config.persistence.sqlitePath) {
    env.NODEBOOKS_SQLITE_PATH = config.persistence.sqlitePath;
  }
  if (
    config.persistence.driver === "postgres" &&
    config.persistence.databaseUrl
  ) {
    env.DATABASE_URL = config.persistence.databaseUrl;
  }
  if (config.ai.provider === "openai" && config.ai.openai) {
    if (config.ai.openai.model) {
      env.NODEBOOKS_OPENAI_MODEL = config.ai.openai.model;
    }
    if (config.ai.openai.apiKey) {
      env.NODEBOOKS_OPENAI_API_KEY = config.ai.openai.apiKey;
    }
  }
  if (config.ai.provider === "heroku" && config.ai.heroku) {
    if (config.ai.heroku.modelId) {
      env.NODEBOOKS_HEROKU_MODEL_ID = config.ai.heroku.modelId;
    }
    if (config.ai.heroku.inferenceKey) {
      env.NODEBOOKS_HEROKU_INFERENCE_KEY = config.ai.heroku.inferenceKey;
    }
    if (config.ai.heroku.inferenceUrl) {
      env.NODEBOOKS_HEROKU_INFERENCE_URL = config.ai.heroku.inferenceUrl;
    }
  }
  return env;
};

export const cliConfigToGlobalSettings = (
  config: CliConfig
): Partial<GlobalSettings> => {
  const settings: Partial<GlobalSettings> = {
    theme: config.theme,
    aiEnabled: config.ai.enabled,
  };
  const aiSettings = serializeAiConfig(config.ai);
  if (aiSettings) {
    settings.ai = aiSettings;
  }
  return settings;
};

export const syncCliConfigToSettings = async (
  store: SettingsWriter,
  config: CliConfig
): Promise<void> => {
  const settings = cliConfigToGlobalSettings(config);
  const entries: Array<[string, unknown]> = [
    ["theme", settings.theme],
    ["aiEnabled", settings.aiEnabled],
    ["ai", settings.ai],
  ];

  for (const [key, value] of entries) {
    if (value === undefined) {
      await store.delete(key);
    } else {
      await store.set(key, value);
    }
  }
};

const serializePersistence = (persistence: CliConfig["persistence"]) => {
  const payload: Record<string, string> = {
    driver: persistence.driver,
  };
  if (persistence.driver === "sqlite" && persistence.sqlitePath) {
    payload.sqlitePath = persistence.sqlitePath;
  }
  if (persistence.driver === "postgres" && persistence.databaseUrl) {
    payload.databaseUrl = persistence.databaseUrl;
  }
  return payload;
};

const serializeAi = (ai: CliConfig["ai"]) => {
  const payload: Record<string, unknown> = {
    enabled: ai.enabled,
    provider: ai.provider,
  };
  if (ai.openai && Object.keys(ai.openai).length > 0) {
    payload.openai = { ...ai.openai };
  }
  if (ai.heroku && Object.keys(ai.heroku).length > 0) {
    payload.heroku = { ...ai.heroku };
  }
  return payload;
};

const serializeAiConfig = (
  ai: CliConfig["ai"]
): Partial<AiConfig> | undefined => {
  const payload: Partial<AiConfig> = {
    provider: ai.provider,
  };
  if (ai.openai && Object.keys(ai.openai).length > 0) {
    payload.openai = { ...ai.openai };
  }
  if (ai.heroku && Object.keys(ai.heroku).length > 0) {
    payload.heroku = { ...ai.heroku };
  }
  if (Object.keys(payload).length > 0) {
    return payload;
  }
  return undefined;
};

const configsEqual = (a: CliConfig, b: CliConfig): boolean => {
  return JSON.stringify(a) === JSON.stringify(b);
};
