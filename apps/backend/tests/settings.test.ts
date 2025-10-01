import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";

import {
  PASSWORD_COOKIE_NAME,
  derivePasswordToken,
} from "../src/auth/password.js";
import { registerSettingsRoutes } from "../src/routes/settings.js";
import { InMemorySettingsStore } from "../src/store/memory.js";
import { SettingsService } from "../src/settings/service.js";

const originalTheme = process.env.NODEBOOKS_THEME;
const originalTimeout = process.env.NODEBOOKS_KERNEL_TIMEOUT_MS;
const originalPassword = process.env.NODEBOOKS_PASSWORD;
const originalAiEnabled = process.env.NODEBOOKS_AI_ENABLED;

describe("settings routes", () => {
  const createApp = async () => {
    const app = Fastify();
    const settingsStore = new InMemorySettingsStore();
    const settingsService = new SettingsService(settingsStore);
    await settingsService.whenReady();

    await app.register(fastifyCookie);
    await registerSettingsRoutes(app, {
      settings: settingsService,
      cookieOptions: {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: false,
      },
    });
    await app.ready();
    return { app, settingsService };
  };

  beforeEach(() => {
    delete process.env.NODEBOOKS_THEME;
    delete process.env.NODEBOOKS_KERNEL_TIMEOUT_MS;
    delete process.env.NODEBOOKS_PASSWORD;
    delete process.env.NODEBOOKS_AI_ENABLED;
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
    if (originalPassword === undefined) {
      delete process.env.NODEBOOKS_PASSWORD;
    } else {
      process.env.NODEBOOKS_PASSWORD = originalPassword;
    }
    if (originalAiEnabled === undefined) {
      delete process.env.NODEBOOKS_AI_ENABLED;
    } else {
      process.env.NODEBOOKS_AI_ENABLED = originalAiEnabled;
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
        passwordEnabled: false,
        aiEnabled: true,
        ai: {
          provider: "openai",
          openai: { model: "gpt-4o-mini", apiKey: null },
          heroku: { modelId: null, inferenceKey: null, inferenceUrl: null },
        },
      },
    });
    expect(settingsService.getPasswordToken()).toBeNull();
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
        passwordEnabled: false,
        aiEnabled: true,
        ai: {
          provider: "openai",
          openai: { model: "gpt-4o-mini", apiKey: null },
          heroku: { modelId: null, inferenceKey: null, inferenceUrl: null },
        },
      },
    });
    expect(process.env.NODEBOOKS_THEME).toBe("dark");
    expect(process.env.NODEBOOKS_KERNEL_TIMEOUT_MS).toBe("15000");
    expect(settingsService.getSnapshot()).toEqual({
      theme: "dark",
      kernelTimeoutMs: 15_000,
      passwordEnabled: false,
      aiEnabled: true,
      ai: {
        provider: "openai",
        openai: { model: "gpt-4o-mini", apiKey: null },
        heroku: { modelId: null, inferenceKey: null, inferenceUrl: null },
      },
    });
    await app.close();
  });

  it("sets a password and returns a cookie", async () => {
    const { app, settingsService } = await createApp();
    const res = await app.inject({
      method: "PUT",
      url: "/settings",
      payload: { password: "secret" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: {
        theme: "light",
        kernelTimeoutMs: 10_000,
        passwordEnabled: true,
        aiEnabled: true,
        ai: {
          provider: "openai",
          openai: { model: "gpt-4o-mini", apiKey: null },
          heroku: { modelId: null, inferenceKey: null, inferenceUrl: null },
        },
      },
    });
    expect(settingsService.getPasswordToken()).toBe(
      derivePasswordToken("secret")
    );
    const cookie = res.cookies.find(
      (item) => item.name === PASSWORD_COOKIE_NAME
    );
    expect(cookie?.value).toBe(derivePasswordToken("secret"));
    await app.close();
  });

  it("clears the password", async () => {
    const { app, settingsService } = await createApp();
    const createRes = await app.inject({
      method: "PUT",
      url: "/settings",
      payload: { password: "secret" },
    });
    expect(createRes.statusCode).toBe(200);
    const res = await app.inject({
      method: "PUT",
      url: "/settings",
      payload: { password: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: {
        theme: "light",
        kernelTimeoutMs: 10_000,
        passwordEnabled: false,
        aiEnabled: true,
        ai: {
          provider: "openai",
          openai: { model: "gpt-4o-mini", apiKey: null },
          heroku: { modelId: null, inferenceKey: null, inferenceUrl: null },
        },
      },
    });
    expect(settingsService.getPasswordToken()).toBeNull();
    const cookieHeader = res.headers["set-cookie"];
    const serialized = Array.isArray(cookieHeader)
      ? cookieHeader.join(";")
      : (cookieHeader ?? "");
    expect(serialized).toContain(`${PASSWORD_COOKIE_NAME}=`);
    expect(serialized).toMatch(/Expires=/);
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
      passwordEnabled: false,
      aiEnabled: true,
      ai: {
        provider: "openai",
        openai: { model: "gpt-4o-mini", apiKey: null },
        heroku: { modelId: null, inferenceKey: null, inferenceUrl: null },
      },
    });
    await app.close();
  });
});
