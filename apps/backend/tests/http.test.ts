import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  createEmptyNotebook,
  type HttpResponse,
} from "@nodebooks/notebook-schema";
import { registerHttpRoutes } from "../src/routes/http.js";
import {
  InMemoryNotebookStore,
  InMemoryNotebookCollaboratorStore,
} from "../src/store/memory.js";
import type { SafeUser } from "../src/types.js";

describe("HTTP routes", () => {
  const createAdminUser = (): SafeUser => ({
    id: "user-admin",
    email: "admin@example.com",
    name: "Admin",
    role: "admin",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("executes HTTP requests with variable substitution", async () => {
    const store = new InMemoryNotebookStore([]);
    const collaborators = new InMemoryNotebookCollaboratorStore();
    const notebook = createEmptyNotebook({
      id: "nb-1",
      env: {
        runtime: "node",
        version: "20.10.0",
        packages: {},
        variables: {
          API_URL: "https://example.com",
          API_KEY: "secret",
        },
      },
      cells: [],
    });
    await store.save(notebook);

    const app = Fastify();
    app.addHook("preHandler", (req, _reply, done) => {
      (req as typeof req & { user: SafeUser }).user = createAdminUser();
      done();
    });

    registerHttpRoutes(app, store, collaborators);
    await app.ready();

    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Test": "value",
        },
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb-1/http",
      payload: {
        cellId: "cell-1",
        request: {
          method: "POST",
          url: "{{API_URL}}/ping",
          headers: [
            {
              id: "hdr-1",
              name: "Authorization",
              value: "Bearer {{API_KEY}}",
              enabled: true,
            },
          ],
          body: {
            mode: "json",
            text: '{"hello": "world"}',
          },
        },
        assignVariable: "httpResult",
        assignBody: "latestBody",
        assignHeaders: "latestHeaders",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("https://example.com/ping");
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
    });
    expect(init?.body).toBe(JSON.stringify({ hello: "world" }));

    const body = response.json() as {
      data?: {
        response?: HttpResponse;
        assignments?: { variable?: string; body?: string; headers?: string };
      };
    };
    expect(body?.data?.response?.status).toBe(200);
    expect(body?.data?.response?.body?.type).toBe("json");
    expect(body?.data?.response?.curl).toContain("curl -X POST");
    expect(body?.data?.assignments).toEqual({
      variable: "httpResult",
      body: "latestBody",
      headers: "latestHeaders",
    });
    expect(body?.data?.response?.assignedVariable).toBe("httpResult");
    expect(body?.data?.response?.assignedBody).toBe("latestBody");
    expect(body?.data?.response?.assignedHeaders).toBe("latestHeaders");
    await app.close();
  });

  it("rejects invalid assignment identifiers", async () => {
    const store = new InMemoryNotebookStore([]);
    const collaborators = new InMemoryNotebookCollaboratorStore();
    const notebook = createEmptyNotebook({
      id: "nb-assign",
      env: {
        runtime: "node",
        version: "20.10.0",
        packages: {},
        variables: {},
      },
      cells: [],
    });
    await store.save(notebook);

    const app = Fastify();
    app.addHook("preHandler", (req, _reply, done) => {
      (req as typeof req & { user: SafeUser }).user = createAdminUser();
      done();
    });

    registerHttpRoutes(app, store, collaborators);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb-assign/http",
      payload: {
        cellId: "cell-x",
        request: {
          method: "GET",
          url: "https://example.com/api",
        },
        assignBody: "123-invalid",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = response.json() as { error?: string };
    expect(body.error).toBe("Body assignment must be a valid identifier");
    await app.close();
  });

  it("rejects requests to blocked destinations", async () => {
    const store = new InMemoryNotebookStore([]);
    const collaborators = new InMemoryNotebookCollaboratorStore();
    const notebook = createEmptyNotebook({
      id: "nb-2",
      env: {
        runtime: "node",
        version: "20.10.0",
        packages: {},
        variables: {},
      },
      cells: [],
    });
    await store.save(notebook);

    const app = Fastify();
    app.addHook("preHandler", (req, _reply, done) => {
      (req as typeof req & { user: SafeUser }).user = createAdminUser();
      done();
    });

    registerHttpRoutes(app, store, collaborators);
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/notebooks/nb-2/http",
      payload: {
        cellId: "cell-2",
        request: {
          method: "GET",
          url: "http://localhost/internal",
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    const body = response.json() as { error?: string };
    expect(body.error).toBe("Destination URL is not allowed");
    await app.close();
  });
});
