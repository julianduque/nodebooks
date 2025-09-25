import { describe, it, expect } from "vitest";
import {
  loadServerConfig,
  loadRuntimeConfig,
  loadClientConfig,
} from "../src/index.js";

describe("@nodebooks/config – loadServerConfig", () => {
  it("returns sane defaults when env is empty", () => {
    const cfg = loadServerConfig({} as NodeJS.ProcessEnv);
    expect(cfg.port).toBe(4000);
    expect(cfg.host).toBe("0.0.0.0");
    expect(cfg.isDev).toBe(true);
    expect(cfg.isProd).toBe(false);
    expect(cfg.embedNext).toBe(true);
    expect(cfg.keepClientCwd).toBe(true);
    expect(cfg.password).toBeUndefined();
    expect(cfg.theme).toBe("light");
    expect(cfg.kernelTimeoutMs).toBe(10_000);
    expect(cfg.kernelWsHeartbeatMs).toBeUndefined();
    expect(cfg.persistence.driver).toBe("sqlite");
    expect(cfg.persistence.sqlitePath).toBe(".data/nodebooks.sqlite");
    expect(cfg.persistence.databaseUrl).toBeUndefined();
    expect(cfg.templatesDir).toBeUndefined();
  });

  it("parses production mode and booleans", () => {
    const cfg = loadServerConfig({
      NODE_ENV: "production",
      EMBED_NEXT: "false",
      NEXT_KEEP_CLIENT_CWD: "0",
    } as NodeJS.ProcessEnv);
    expect(cfg.isProd).toBe(true);
    expect(cfg.isDev).toBe(false);
    expect(cfg.embedNext).toBe(false);
    expect(cfg.keepClientCwd).toBe(false);
  });

  it("reads theme, timeouts, and heartbeat", () => {
    const cfg = loadServerConfig({
      NODEBOOKS_THEME: "dark",
      NODEBOOKS_KERNEL_TIMEOUT_MS: "15000",
      KERNEL_WS_HEARTBEAT_MS: "30000",
    } as NodeJS.ProcessEnv);
    expect(cfg.theme).toBe("dark");
    expect(cfg.kernelTimeoutMs).toBe(15_000);
    expect(cfg.kernelWsHeartbeatMs).toBe(30_000);
  });

  it("parses persistence options", () => {
    const cfg = loadServerConfig({
      NODEBOOKS_PERSISTENCE: "postgres",
      DATABASE_URL: "postgres://user:pass@host:5432/db",
      NODEBOOKS_SQLITE_PATH: "/tmp/file.sqlite",
      NODEBOOKS_TEMPLATE_DIR: "./content/custom",
    } as NodeJS.ProcessEnv);
    expect(cfg.persistence.driver).toBe("postgres");
    expect(cfg.persistence.databaseUrl).toContain("postgres://");
    // sqlitePath uses provided env regardless of driver; consumer decides usage
    expect(cfg.persistence.sqlitePath).toBe("/tmp/file.sqlite");
    expect(cfg.templatesDir).toBe("./content/custom");
  });
});

describe("@nodebooks/config – loadRuntimeConfig", () => {
  it("defaults when unset", () => {
    const cfg = loadRuntimeConfig({} as NodeJS.ProcessEnv);
    expect(cfg.kernelTimeoutMs).toBe(10_000);
    expect(cfg.batchMs).toBe(25);
    expect(cfg.debug).toBe(false);
  });
});

describe("@nodebooks/config – loadClientConfig", () => {
  it("reads NEXT_PUBLIC_* and applies defaults", () => {
    const cfg = loadClientConfig({
      NEXT_PUBLIC_SITE_URL: "https://example.test",
      NEXT_PUBLIC_API_BASE_URL: "/api",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg.siteUrl).toBe("https://example.test");
    expect(cfg.apiBaseUrl).toBe("/api");
  });

  it("defaults apiBaseUrl to /api when unset", () => {
    const cfg = loadClientConfig({} as NodeJS.ProcessEnv);
    expect(cfg.apiBaseUrl).toBe("/api");
  });
});
