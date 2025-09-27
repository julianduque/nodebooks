import { loadServerConfig } from "@nodebooks/config";
import {
  GlobalSettingsSchema,
  ThemeModeSchema,
  type GlobalSettings,
  type ThemeMode,
} from "@nodebooks/notebook-schema";

import { derivePasswordToken } from "../auth/password.js";
import type { SettingsStore } from "../types.js";

const ENV_KEYS = {
  theme: "NODEBOOKS_THEME",
  kernelTimeoutMs: "NODEBOOKS_KERNEL_TIMEOUT_MS",
  password: "NODEBOOKS_PASSWORD",
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

const normalizePassword = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export interface SettingsSnapshot {
  theme: ThemeMode;
  kernelTimeoutMs: number;
  passwordEnabled: boolean;
}

export interface SettingsUpdate {
  theme?: ThemeMode;
  kernelTimeoutMs?: number;
  password?: string | null;
}

export class SettingsService {
  private readonly ready: Promise<void>;
  private settings: Partial<GlobalSettings> = {};
  private passwordToken: string | null = null;
  private readonly initialEnv: Record<
    keyof typeof ENV_KEYS,
    string | undefined
  > = {
    theme: process.env[ENV_KEYS.theme],
    kernelTimeoutMs: process.env[ENV_KEYS.kernelTimeoutMs],
    password: process.env[ENV_KEYS.password],
  };

  constructor(private readonly store: SettingsStore) {
    this.ready = this.initialize();
  }

  async whenReady(): Promise<void> {
    await this.ready;
  }

  getPasswordToken(): string | null {
    return this.passwordToken;
  }

  getSettings(): Partial<GlobalSettings> {
    return { ...this.settings };
  }

  getSnapshot(): SettingsSnapshot {
    const cfg = loadServerConfig(undefined, this.settings);
    return {
      theme: cfg.theme,
      kernelTimeoutMs: cfg.kernelTimeoutMs,
      passwordEnabled: this.passwordToken !== null,
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
    if (update.password !== undefined) {
      await this.applyPassword(update.password);
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

    const password = normalizePassword(normalized.password);
    if (password) {
      normalized.password = password;
    } else {
      delete normalized.password;
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

  private async applyPassword(value: string | null) {
    const password = value === null ? undefined : normalizePassword(value);
    if (password) {
      this.settings.password = password;
      this.passwordToken = derivePasswordToken(password);
      await this.store.set("password", password);
      return;
    }
    delete this.settings.password;
    this.passwordToken = null;
    await this.store.delete("password");
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

    const password = normalizePassword(snapshot.password);
    if (password) {
      process.env[ENV_KEYS.password] = password;
      this.passwordToken = derivePasswordToken(password);
    } else {
      this.restoreInitialEnv("password");
      const envPassword = normalizePassword(this.initialEnv.password);
      this.passwordToken = envPassword
        ? derivePasswordToken(envPassword)
        : null;
      delete snapshot.password;
    }

    const runtime = globalThis as typeof globalThis & {
      __NODEBOOKS_SETTINGS__?: Partial<GlobalSettings>;
    };
    const runtimeSnapshot: Partial<GlobalSettings> = { ...snapshot };
    delete runtimeSnapshot.password;
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
