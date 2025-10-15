import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildCliEnvironment,
  createDefaultCliConfig,
  prepareCliConfig,
  saveCliConfig,
  syncCliConfigToSettings,
} from "../src/cli.js";

const originalEnv = { ...process.env };
const tempConfigDirs = new Set<string>();

const resetEnv = () => {
  process.env.XDG_CONFIG_HOME = originalEnv.XDG_CONFIG_HOME;
  process.env.XDG_DATA_HOME = originalEnv.XDG_DATA_HOME;
  process.env.APPDATA = originalEnv.APPDATA;
  tempConfigDirs.clear();
};

describe("CLI config helpers", () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(async () => {
    for (const dir of tempConfigDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    resetEnv();
  });

  it("builds environment variables from config", () => {
    const config = createDefaultCliConfig();
    const env = buildCliEnvironment(config);
    expect(env.NODEBOOKS_PERSISTENCE).toBe("sqlite");
    expect(env.NODEBOOKS_THEME).toBe(config.theme);
    expect(env.NODEBOOKS_AI_ENABLED).toBe("true");
    expect(env.NODEBOOKS_AI_PROVIDER).toBe("openai");
  });

  it("prepares sqlite directories respecting XDG paths", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nbks-config-"));
    const configDir = path.join(tmpRoot, "config");
    process.env.XDG_CONFIG_HOME = configDir;
    process.env.XDG_DATA_HOME = path.join(tmpRoot, "data");
    tempConfigDirs.add(configDir);

    const config = createDefaultCliConfig();
    const prepared = await prepareCliConfig(config);
    const sqlitePath = prepared.config.persistence.sqlitePath;
    if (process.platform !== "darwin" && process.platform !== "win32") {
      expect(sqlitePath).toContain(path.join(tmpRoot, "data"));
    }
    const dirExists = await fs
      .stat(path.dirname(sqlitePath ?? ""))
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(true);
  });

  it("saves config with sanitized payload", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "nbks-config-"));
    const configDir = path.join(tmpRoot, "config");
    process.env.XDG_CONFIG_HOME = configDir;
    process.env.XDG_DATA_HOME = path.join(tmpRoot, "data");
    tempConfigDirs.add(configDir);

    const config = createDefaultCliConfig();
    const saved = await saveCliConfig(config);
    expect(saved.persistence.sqlitePath).toBeDefined();
    const env = buildCliEnvironment(saved);
    expect(env.NODEBOOKS_SQLITE_PATH).toBe(saved.persistence.sqlitePath);
  });

  it("syncs configuration into settings store", async () => {
    const config = createDefaultCliConfig();
    const store: { calls: Array<[string, unknown]> } & {
      set: (key: string, value: unknown) => Promise<void>;
      delete: (key: string) => Promise<void>;
    } = {
      calls: [],
      async set(key, value) {
        this.calls.push([key, value]);
      },
      async delete(key) {
        this.calls.push([key, undefined]);
      },
    };

    await syncCliConfigToSettings(store, config);
    expect(store.calls).toContainEqual(["theme", config.theme]);
    expect(store.calls).toContainEqual(["aiEnabled", true]);
  });
});
