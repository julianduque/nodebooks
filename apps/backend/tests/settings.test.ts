import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";

import { PASSWORD_COOKIE_NAME } from "../src/auth/password.js";
import { registerSettingsRoutes } from "../src/routes/settings.js";

const originalTheme = process.env.NODEBOOKS_THEME;
const originalTimeout = process.env.NODEBOOKS_KERNEL_TIMEOUT_MS;
const originalPassword = process.env.NODEBOOKS_PASSWORD;

describe("settings routes", () => {
  let passwordToken: string | null;
  const setPasswordMock = vi.fn((value: string | null) => {
    if (value) {
      process.env.NODEBOOKS_PASSWORD = value;
      passwordToken = `token:${value}`;
    } else {
      delete process.env.NODEBOOKS_PASSWORD;
      passwordToken = null;
    }
    return passwordToken;
  });

  const createApp = async () => {
    const app = Fastify();
    passwordToken = null;
    await app.register(fastifyCookie);
    await registerSettingsRoutes(app, {
      getPasswordToken: () => passwordToken,
      setPassword: (value) => setPasswordMock(value),
      cookieOptions: {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: false,
      },
    });
    await app.ready();
    return app;
  };

  beforeEach(() => {
    setPasswordMock.mockClear();
    delete process.env.NODEBOOKS_THEME;
    delete process.env.NODEBOOKS_KERNEL_TIMEOUT_MS;
    delete process.env.NODEBOOKS_PASSWORD;
    passwordToken = null;
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
    passwordToken = null;
  });

  it("returns current settings", async () => {
    const app = await createApp();
    const res = await app.inject({ method: "GET", url: "/settings" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: { theme: "light", kernelTimeoutMs: 10_000, passwordEnabled: false },
    });
    await app.close();
  });

  it("updates theme and kernel timeout", async () => {
    const app = await createApp();
    const res = await app.inject({
      method: "PUT",
      url: "/settings",
      payload: { theme: "dark", kernelTimeoutMs: 15_000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: { theme: "dark", kernelTimeoutMs: 15_000, passwordEnabled: false },
    });
    expect(process.env.NODEBOOKS_THEME).toBe("dark");
    expect(process.env.NODEBOOKS_KERNEL_TIMEOUT_MS).toBe("15000");
    await app.close();
  });

  it("sets a password and returns a cookie", async () => {
    const app = await createApp();
    const res = await app.inject({
      method: "PUT",
      url: "/settings",
      payload: { password: "secret" },
    });
    expect(res.statusCode).toBe(200);
    expect(setPasswordMock).toHaveBeenCalledWith("secret");
    expect(res.json()).toEqual({
      data: { theme: "light", kernelTimeoutMs: 10_000, passwordEnabled: true },
    });
    expect(passwordToken).toBe("token:secret");
    const cookie = res.cookies.find(
      (item) => item.name === PASSWORD_COOKIE_NAME
    );
    expect(cookie?.value).toBe("token:secret");
    await app.close();
  });

  it("clears the password", async () => {
    const app = await createApp();
    await app.inject({
      method: "PUT",
      url: "/settings",
      payload: { password: "secret" },
    });
    const res = await app.inject({
      method: "PUT",
      url: "/settings",
      payload: { password: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: { theme: "light", kernelTimeoutMs: 10_000, passwordEnabled: false },
    });
    expect(setPasswordMock).toHaveBeenLastCalledWith(null);
    const cookieHeader = res.headers["set-cookie"];
    const serialized = Array.isArray(cookieHeader)
      ? cookieHeader.join(";")
      : cookieHeader ?? "";
    expect(serialized).toContain(`${PASSWORD_COOKIE_NAME}=`);
    expect(serialized).toMatch(/Expires=/);
    await app.close();
  });

  it("rejects invalid timeouts", async () => {
    const app = await createApp();
    const res = await app.inject({
      method: "PUT",
      url: "/settings",
      payload: { kernelTimeoutMs: 250 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Invalid settings payload" });
    expect(setPasswordMock).not.toHaveBeenCalled();
    await app.close();
  });
});

