export type PersistenceDriver = "sqlite" | "postgres" | "memory";

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

export interface ClientConfig {
  siteUrl?: string;
  apiBaseUrl: string;
}

export interface RuntimeConfig {
  kernelTimeoutMs: number;
  batchMs: number;
  debug: boolean;
}
