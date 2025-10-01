import { afterEach, describe, expect, it } from "vitest";
import Fastify from "fastify";

import { registerAiRoutes } from "../src/routes/ai.js";
import { SettingsService } from "../src/settings/service.js";
import { InMemorySettingsStore } from "../src/store/memory.js";

const originalAiEnabled = process.env.NODEBOOKS_AI_ENABLED;
const originalOpenAiKey = process.env.NODEBOOKS_OPENAI_API_KEY;

describe("AI routes", () => {
  const createApp = async () => {
    const settingsService = new SettingsService(new InMemorySettingsStore());
    await settingsService.whenReady();

    const app = Fastify();
    await registerAiRoutes(app, { settings: settingsService });
    await app.ready();

    return { app, settingsService };
  };

  afterEach(() => {
    if (originalAiEnabled === undefined) {
      delete process.env.NODEBOOKS_AI_ENABLED;
    } else {
      process.env.NODEBOOKS_AI_ENABLED = originalAiEnabled;
    }
    if (originalOpenAiKey === undefined) {
      delete process.env.NODEBOOKS_OPENAI_API_KEY;
    } else {
      process.env.NODEBOOKS_OPENAI_API_KEY = originalOpenAiKey;
    }
  });

  it("returns an error when OpenAI credentials are missing", async () => {
    const { app } = await createApp();

    const res = await app.inject({
      method: "POST",
      url: "/ai/generate",
      payload: { cellType: "markdown", prompt: "Document the project" },
    });

    expect(res.statusCode).toBe(500);
    expect(res.headers["content-type"]).toContain("application/json");
    const body = JSON.parse(res.body) as { error?: string };
    expect(body.error).toBe("AI assistant is not configured for OpenAI.");

    await app.close();
  });
});
