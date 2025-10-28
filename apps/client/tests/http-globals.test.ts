import { describe, expect, it } from "vitest";
import { computeHttpGlobals } from "@/components/notebook/runtime-globals";

describe("computeHttpGlobals", () => {
  it("creates globals for assigned body and headers", () => {
    const notebook: Parameters<typeof computeHttpGlobals>[0] = {
      id: "nb-1",
      name: "",
      cells: [
        {
          id: "http-1",
          type: "http",
          metadata: {},
          request: {
            method: "GET",
            url: "https://example.com/api",
            headers: [],
            query: [],
            body: { mode: "none", text: "", contentType: "application/json" },
          },
          response: {
            status: 200,
            ok: true,
            url: "https://example.com/api",
            durationMs: 120,
            timestamp: "2024-01-01T00:00:00.000Z",
            headers: [
              { name: "Content-Type", value: "application/json" },
              { name: "X-Test", value: "value" },
            ],
            body: {
              type: "json",
              json: { ok: true },
              text: JSON.stringify({ ok: true }),
              contentType: "application/json",
              encoding: "utf8",
              size: 14,
            },
            curl: "curl -X GET https://example.com/api",
            assignedVariable: "httpResult",
            assignedBody: "latestBody",
            assignedHeaders: "latestHeaders",
          },
          assignVariable: "httpResult",
          assignBody: "latestBody",
          assignHeaders: "latestHeaders",
        },
      ],
      env: { runtime: "node", version: "20", packages: {}, variables: {} },
      sql: { connections: [] },
      attachments: [],
      published: false,
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    } as unknown as Parameters<typeof computeHttpGlobals>[0];
    const globals = computeHttpGlobals(notebook);

    expect(globals).toHaveProperty("httpResult");
    expect(globals).toHaveProperty("latestBody");
    expect(globals).toHaveProperty("latestHeaders");

    const bodyGlobal = globals.latestBody as Record<string, unknown>;
    expect(bodyGlobal).toMatchObject({
      json: { ok: true },
      status: 200,
      ok: true,
      headers: {
        "Content-Type": "application/json",
        "X-Test": "value",
      },
    });

    const headersGlobal = globals.latestHeaders as Record<string, string>;
    expect(headersGlobal).toEqual({
      "Content-Type": "application/json",
      "X-Test": "value",
    });

    const responseGlobal = globals.httpResult as {
      status: number | null;
      body: { json: unknown };
      headers: Record<string, string>;
    };
    expect(responseGlobal.status).toBe(200);
    expect(responseGlobal.body.json).toEqual({ ok: true });
    expect(responseGlobal.headers).toEqual({
      "Content-Type": "application/json",
      "X-Test": "value",
    });
  });
});
