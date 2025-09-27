export type PersistenceDriver = "sqlite" | "postgres" | "memory";

export type ThemeMode = "light" | "dark";

export interface ServerConfig {
  host: string;
  port: number;
  isDev: boolean;
  isProd: boolean;
  embedNext: boolean;
  keepClientCwd: boolean;
  password?: string;
  theme: "light" | "dark";
  kernelTimeoutMs: number;
  kernelWsHeartbeatMs?: number;
  persistence: {
    driver: PersistenceDriver;
    sqlitePath?: string;
    databaseUrl?: string;
  };
  templatesDir?: string;
}

export interface GlobalSettings {
  theme?: ThemeMode;
  kernelTimeoutMs?: number;
  password?: string | null;
  [key: string]: unknown;
}

export interface ClientConfig {
  siteUrl?: string;
  apiBaseUrl: string;
}

export interface RuntimeConfig {
  kernelTimeoutMs: number;
  batchMs: number;
  debug: boolean;
}
