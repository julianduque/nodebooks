export type PersistenceDriver = "sqlite" | "postgres" | "memory";

export type ThemeMode = "light" | "dark";

export type AiProvider = "openai" | "heroku";

export interface OpenAiConfig {
  model?: string;
  apiKey?: string;
}

export interface HerokuAiConfig {
  modelId?: string;
  inferenceKey?: string;
  inferenceUrl?: string;
}

export interface AiConfig {
  enabled: boolean;
  provider: AiProvider;
  openai?: OpenAiConfig;
  heroku?: HerokuAiConfig;
}

export interface ServerConfig {
  host: string;
  port: number;
  isDev: boolean;
  isProd: boolean;
  embedNext: boolean;
  keepClientCwd: boolean;
  theme: "light" | "dark";
  kernelTimeoutMs: number;
  kernelWsHeartbeatMs?: number;
  terminalCellsEnabled: boolean;
  persistence: {
    driver: PersistenceDriver;
    sqlitePath?: string;
    databaseUrl?: string;
  };
  ai: AiConfig;
}

export interface GlobalSettings {
  theme?: ThemeMode;
  kernelTimeoutMs?: number;
  aiEnabled?: boolean;
  terminalCellsEnabled?: boolean;
  ai?: Partial<AiConfig>;
  [key: string]: unknown;
}

export interface ClientConfig {
  siteUrl?: string;
  apiBaseUrl: string;
}

export interface RuntimeConfig {
  kernelTimeoutMs: number;
  batchMs: number;
}
