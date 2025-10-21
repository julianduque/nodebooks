import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";

import { registerSettingsRoutes } from "../src/routes/settings.js";
import { InMemorySettingsStore } from "../src/store/memory.js";
import { SettingsService } from "../src/settings/service.js";

vi.mock("../src/notebooks/permissions.js", () => ({
  ensureAdmin: () => true,
}));

const originalTheme = process.env.NODEBOOKS_THEME;
const originalTimeout = process.env.NODEBOOKS_KERNEL_TIMEOUT_MS;
const originalAiEnabled = process.env.NODEBOOKS_AI_ENABLED;
const originalTerminalCellsEnabled = process.env.NODEBOOKS_TERMINALS_ENABLED;

describe("settings routes", () => {
  const createApp = async () => {
    const app = Fastify();
    const settingsStore = new InMemorySettingsStore();
    const settingsService = new SettingsService(settingsStore);
    await settingsService.whenReady();

    await app.register(fastifyCookie);
    await registerSettingsRoutes(app, {
      settings: settingsService,
    });
    await app.ready();
    return { app, settingsService };
  };

  beforeEach(() => {
    delete process.env.NODEBOOKS_THEME;
    delete process.env.NODEBOOKS_KERNEL_TIMEOUT_MS;
    delete process.env.NODEBOOKS_AI_ENABLED;
    delete process.env.NODEBOOKS_TERMINALS_ENABLED;
  });

  afterEach(() => {
    if (originalTheme === undefined) {
      delete process.env.NODEBOOKS_THEME;
    } else {
      process.env.NODEBOOKS_THEME = originalTheme;
    }
    if (originalTimeout === undefined) {
      delete process.env.NODEBOOKS_KERNEL_TIMEOUT_MS;
    } else {
      process.env.NODEBOOKS_KERNEL_TIMEOUT_MS = originalTimeout;
    }
    if (originalAiEnabled === undefined) {
      delete process.env.NODEBOOKS_AI_ENABLED;
    } else {
      process.env.NODEBOOKS_AI_ENABLED = originalAiEnabled;
    }
    if (originalTerminalCellsEnabled === undefined) {
      delete process.env.NODEBOOKS_TERMINALS_ENABLED;
    } else {
      process.env.NODEBOOKS_TERMINALS_ENABLED = originalTerminalCellsEnabled;
    }
    const runtime = globalThis as typeof globalThis & {
      __NODEBOOKS_SETTINGS__?: Record<string, unknown>;
    };
    delete runtime.__NODEBOOKS_SETTINGS__;
  });

  it("returns current settings", async () => {
    const { app, settingsService } = await createApp();
    const res = await app.inject({ method: "GET", url: "/settings" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: {
        theme: "light",
        kernelTimeoutMs: 10_000,
        aiEnabled: false,
        terminalCellsEnabled: false,
        ai: {
          provider: "openai",
          openai: { model: "gpt-4o-mini", apiKeyConfigured: false },
          heroku: {
            modelId: null,
            inferenceKeyConfigured: false,
            inferenceUrl: null,
          },
        },
      },
    });
    await app.close();
  });

  it("updates theme and kernel timeout", async () => {
    const { app, settingsService } = await createApp();
    const res = await app.inject({
      method: "PUT",
      url: "/settings",
      payload: { theme: "dark", kernelTimeoutMs: 15_000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: {
        theme: "dark",
        kernelTimeoutMs: 15_000,
        aiEnabled: false,
        terminalCellsEnabled: false,
        ai: {
          provider: "openai",
          openai: { model: "gpt-4o-mini", apiKeyConfigured: false },
          heroku: {
            modelId: null,
            inferenceKeyConfigured: false,
            inferenceUrl: null,
          },
        },
      },
    });
    expect(process.env.NODEBOOKS_THEME).toBe("dark");
    expect(process.env.NODEBOOKS_KERNEL_TIMEOUT_MS).toBe("15000");
    expect(settingsService.getSnapshot()).toEqual({
      theme: "dark",
      kernelTimeoutMs: 15_000,
      aiEnabled: false,
      terminalCellsEnabled: false,
      ai: {
        provider: "openai",
        openai: { model: "gpt-4o-mini", apiKeyConfigured: false },
        heroku: {
          modelId: null,
          inferenceKeyConfigured: false,
          inferenceUrl: null,
        },
      },
    });
    await app.close();
  });

  it("rejects invalid timeouts", async () => {
    const { app, settingsService } = await createApp();
    const res = await app.inject({
      method: "PUT",
      url: "/settings",
      payload: { kernelTimeoutMs: 250 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid settings payload" });
    expect(settingsService.getSnapshot()).toEqual({
      theme: "light",
      kernelTimeoutMs: 10_000,
      aiEnabled: false,
      terminalCellsEnabled: false,
      ai: {
        provider: "openai",
        openai: { model: "gpt-4o-mini", apiKeyConfigured: false },
        heroku: {
          modelId: null,
          inferenceKeyConfigured: false,
          inferenceUrl: null,
        },
      },
    });
    await app.close();
  });

  it("masks AI credentials in responses", async () => {
    const { app, settingsService } = await createApp();
    const update = await app.inject({
      method: "PUT",
      url: "/settings",
      payload: {
        ai: {
          provider: "openai",
          openai: { model: "gpt-4o-mini", apiKey: "sk-secret-123" },
        },
      },
    });
    expect(update.statusCode).toBe(200);
    const body = update.json() as {
      data: {
        ai: {
          openai: { apiKeyConfigured: boolean };
        };
      };
    };
    expect(body.data.ai.openai.apiKeyConfigured).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(body.data.ai.openai, "apiKey")
    ).toBe(false);

    const snapshot = settingsService.getSnapshot();
    expect(snapshot.ai.openai.apiKeyConfigured).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(snapshot.ai.openai, "apiKey")
    ).toBe(false);
    expect(process.env.NODEBOOKS_OPENAI_API_KEY).toBe("sk-secret-123");

    const fetchRes = await app.inject({ method: "GET", url: "/settings" });
    expect(fetchRes.statusCode).toBe(200);
    const json = fetchRes.json() as {
      data: {
        ai: {
          openai: { apiKeyConfigured: boolean };
        };
      };
    };
    expect(json.data.ai.openai.apiKeyConfigured).toBe(true);
    expect(
      Object.prototype.hasOwnProperty.call(json.data.ai.openai, "apiKey")
    ).toBe(false);

    await app.close();
  });
});
