import { loadServerConfig } from "@nodebooks/config";
import {
  AiSettingsSchema,
  GlobalSettingsSchema,
  ThemeModeSchema,
  type AiProvider,
  type AiSettings,
  type GlobalSettings,
  type ThemeMode,
} from "@nodebooks/notebook-schema";

import type { SettingsStore } from "../types.js";

const ENV_KEYS = {
  theme: "NODEBOOKS_THEME",
  kernelTimeoutMs: "NODEBOOKS_KERNEL_TIMEOUT_MS",
  aiProvider: "NODEBOOKS_AI_PROVIDER",
  openaiModel: "NODEBOOKS_OPENAI_MODEL",
  openaiApiKey: "NODEBOOKS_OPENAI_API_KEY",
  herokuModelId: "NODEBOOKS_HEROKU_MODEL_ID",
  herokuInferenceKey: "NODEBOOKS_HEROKU_INFERENCE_KEY",
  herokuInferenceUrl: "NODEBOOKS_HEROKU_INFERENCE_URL",
  aiEnabled: "NODEBOOKS_AI_ENABLED",
} as const;

const normalizeTheme = (value: unknown): ThemeMode | undefined => {
  const result = ThemeModeSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const normalizeKernelTimeout = (value: unknown): number | undefined => {
  if (typeof value !== "number") {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  const clamped = Math.min(Math.max(Math.trunc(value), 1_000), 600_000);
  return clamped;
};

const normalizeAiString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeAiEnabled = (value: unknown): boolean | undefined => {
  if (value === null) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    return undefined;
  }
  return value;
};

const hasSecretValue = (value: unknown): boolean => {
  return typeof value === "string" && value.trim().length > 0;
};

const normalizeAiSettings = (value: unknown): AiSettings | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const parsed = AiSettingsSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  const normalized: AiSettings = {};
  const provider: AiProvider =
    parsed.data.provider === "heroku" ? "heroku" : "openai";
  normalized.provider = provider;

  if (parsed.data.openai) {
    const model = normalizeAiString(parsed.data.openai.model);
    const apiKey = normalizeAiString(parsed.data.openai.apiKey);
    if (model || apiKey) {
      normalized.openai = {};
      if (model) normalized.openai.model = model;
      if (apiKey) normalized.openai.apiKey = apiKey;
    }
  }

  if (parsed.data.heroku) {
    const modelId = normalizeAiString(parsed.data.heroku.modelId);
    const inferenceKey = normalizeAiString(parsed.data.heroku.inferenceKey);
    const inferenceUrl = normalizeAiString(parsed.data.heroku.inferenceUrl);
    if (modelId || inferenceKey || inferenceUrl) {
      normalized.heroku = {};
      if (modelId) normalized.heroku.modelId = modelId;
      if (inferenceKey) normalized.heroku.inferenceKey = inferenceKey;
      if (inferenceUrl) normalized.heroku.inferenceUrl = inferenceUrl;
    }
  }

  return normalized;
};

export interface SettingsSnapshot {
  theme: ThemeMode;
  kernelTimeoutMs: number;
  aiEnabled: boolean;
  ai: {
    provider: AiProvider;
    openai: { model: string | null; apiKeyConfigured: boolean };
    heroku: {
      modelId: string | null;
      inferenceKeyConfigured: boolean;
      inferenceUrl: string | null;
    };
  };
}

export interface SettingsUpdate {
  theme?: ThemeMode;
  kernelTimeoutMs?: number;
  aiEnabled?: boolean;
  ai?: AiSettings | null;
}

export class SettingsService {
  private readonly ready: Promise<void>;
  private settings: Partial<GlobalSettings> = {};
  private readonly initialEnv: Record<
    keyof typeof ENV_KEYS,
    string | undefined
  > = {
    theme: process.env[ENV_KEYS.theme],
    kernelTimeoutMs: process.env[ENV_KEYS.kernelTimeoutMs],
    aiProvider: process.env[ENV_KEYS.aiProvider],
    openaiModel: process.env[ENV_KEYS.openaiModel],
    openaiApiKey: process.env[ENV_KEYS.openaiApiKey],
    herokuModelId: process.env[ENV_KEYS.herokuModelId],
    herokuInferenceKey: process.env[ENV_KEYS.herokuInferenceKey],
    herokuInferenceUrl: process.env[ENV_KEYS.herokuInferenceUrl],
    aiEnabled: process.env[ENV_KEYS.aiEnabled],
  };

  constructor(private readonly store: SettingsStore) {
    this.ready = this.initialize();
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  getSettings(): Partial<GlobalSettings> {
    return { ...this.settings };
  }

  getSnapshot(): SettingsSnapshot {
    const cfg = loadServerConfig(undefined, this.settings);
    return {
      theme: cfg.theme,
      kernelTimeoutMs: cfg.kernelTimeoutMs,
      aiEnabled: cfg.ai.enabled,
      ai: {
        provider: cfg.ai.provider,
        openai: {
          model: cfg.ai.openai?.model ?? null,
          apiKeyConfigured: hasSecretValue(cfg.ai.openai?.apiKey),
        },
        heroku: {
          modelId: cfg.ai.heroku?.modelId ?? null,
          inferenceKeyConfigured: hasSecretValue(cfg.ai.heroku?.inferenceKey),
          inferenceUrl: cfg.ai.heroku?.inferenceUrl ?? null,
        },
      },
    };
  }

  async apply(update: SettingsUpdate): Promise<SettingsSnapshot> {
    await this.whenReady();

    if (update.theme !== undefined) {
      await this.applyTheme(update.theme);
    }
    if (update.kernelTimeoutMs !== undefined) {
      await this.applyKernelTimeout(update.kernelTimeoutMs);
    }
    if (update.aiEnabled !== undefined) {
      await this.applyAiEnabled(update.aiEnabled);
    }
    if (update.ai !== undefined) {
      await this.applyAi(update.ai);
    }

    this.applyRuntimeOverrides();
    return this.getSnapshot();
  }

  private async initialize() {
    const stored = await this.store.all();
    const parsed = GlobalSettingsSchema.safeParse(stored);
    if (parsed.success) {
      this.settings = this.normalizeSettings(parsed.data);
    } else {
      this.settings = {};
    }
    this.applyRuntimeOverrides();
  }

  private normalizeSettings(input: GlobalSettings): Partial<GlobalSettings> {
    const normalized: Partial<GlobalSettings> = { ...input };

    const theme = normalizeTheme(normalized.theme);
    if (theme) {
      normalized.theme = theme;
    } else {
      delete normalized.theme;
    }

    const kernel = normalizeKernelTimeout(normalized.kernelTimeoutMs);
    if (kernel !== undefined) {
      normalized.kernelTimeoutMs = kernel;
    } else {
      delete normalized.kernelTimeoutMs;
    }

    const aiEnabled = normalizeAiEnabled(normalized.aiEnabled);
    if (aiEnabled !== undefined) {
      normalized.aiEnabled = aiEnabled;
    } else {
      delete normalized.aiEnabled;
    }

    const ai = normalizeAiSettings(normalized.ai);
    if (ai) {
      normalized.ai = ai;
    } else {
      delete normalized.ai;
    }

    return normalized;
  }

  private async applyTheme(value: ThemeMode) {
    const theme = normalizeTheme(value);
    if (!theme) {
      delete this.settings.theme;
      await this.store.delete("theme");
      return;
    }
    this.settings.theme = theme;
    await this.store.set("theme", theme);
  }

  private async applyKernelTimeout(value: number) {
    const kernel = normalizeKernelTimeout(value);
    if (kernel === undefined) {
      delete this.settings.kernelTimeoutMs;
      await this.store.delete("kernelTimeoutMs");
      return;
    }
    this.settings.kernelTimeoutMs = kernel;
    await this.store.set("kernelTimeoutMs", kernel);
  }

  private async applyAiEnabled(value: boolean) {
    const enabled = normalizeAiEnabled(value);
    if (enabled === undefined) {
      delete this.settings.aiEnabled;
      await this.store.delete("aiEnabled");
      return;
    }
    this.settings.aiEnabled = enabled;
    await this.store.set("aiEnabled", enabled);
  }

  private async applyAi(value: AiSettings | null) {
    const ai = value === null ? undefined : normalizeAiSettings(value);
    if (ai) {
      this.settings.ai = ai;
      await this.store.set("ai", ai);
      return;
    }
    delete this.settings.ai;
    await this.store.delete("ai");
  }

  private applyRuntimeOverrides() {
    const snapshot: Partial<GlobalSettings> = { ...this.settings };

    const theme = normalizeTheme(snapshot.theme);
    if (theme) {
      process.env[ENV_KEYS.theme] = theme;
    } else {
      this.restoreInitialEnv("theme");
      delete snapshot.theme;
    }

    const kernel = normalizeKernelTimeout(snapshot.kernelTimeoutMs);
    if (kernel !== undefined) {
      process.env[ENV_KEYS.kernelTimeoutMs] = String(kernel);
    } else {
      this.restoreInitialEnv("kernelTimeoutMs");
      delete snapshot.kernelTimeoutMs;
    }

    const aiEnabled = normalizeAiEnabled(snapshot.aiEnabled);
    if (aiEnabled !== undefined) {
      process.env[ENV_KEYS.aiEnabled] = aiEnabled ? "true" : "false";
      snapshot.aiEnabled = aiEnabled;
    } else {
      this.restoreInitialEnv("aiEnabled");
      delete snapshot.aiEnabled;
    }

    const ai = normalizeAiSettings(snapshot.ai);
    if (ai) {
      process.env[ENV_KEYS.aiProvider] = ai.provider ?? "openai";
      if (ai.openai?.model) {
        process.env[ENV_KEYS.openaiModel] = ai.openai.model;
      } else {
        this.restoreInitialEnv("openaiModel");
      }
      if (ai.openai?.apiKey) {
        process.env[ENV_KEYS.openaiApiKey] = ai.openai.apiKey;
      } else {
        this.restoreInitialEnv("openaiApiKey");
      }
      if (ai.heroku?.modelId) {
        process.env[ENV_KEYS.herokuModelId] = ai.heroku.modelId;
      } else {
        this.restoreInitialEnv("herokuModelId");
      }
      if (ai.heroku?.inferenceKey) {
        process.env[ENV_KEYS.herokuInferenceKey] = ai.heroku.inferenceKey;
      } else {
        this.restoreInitialEnv("herokuInferenceKey");
      }
      if (ai.heroku?.inferenceUrl) {
        process.env[ENV_KEYS.herokuInferenceUrl] = ai.heroku.inferenceUrl;
      } else {
        this.restoreInitialEnv("herokuInferenceUrl");
      }
      snapshot.ai = ai;
    } else {
      this.restoreInitialEnv("aiProvider");
      this.restoreInitialEnv("openaiModel");
      this.restoreInitialEnv("openaiApiKey");
      this.restoreInitialEnv("herokuModelId");
      this.restoreInitialEnv("herokuInferenceKey");
      this.restoreInitialEnv("herokuInferenceUrl");
      delete snapshot.ai;
    }

    const runtime = globalThis as typeof globalThis & {
      __NODEBOOKS_SETTINGS__?: Partial<GlobalSettings>;
    };
    const runtimeSnapshot: Partial<GlobalSettings> = { ...snapshot };
    runtime.__NODEBOOKS_SETTINGS__ = runtimeSnapshot;
  }

  private restoreInitialEnv(key: keyof typeof ENV_KEYS) {
    const envKey = ENV_KEYS[key];
    const original = this.initialEnv[key];
    if (original === undefined) {
      delete process.env[envKey];
      return;
    }
    process.env[envKey] = original;
  }
}
