import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createCodeCell,
  ensureNotebookRuntimeVersion,
  NotebookSchema,
} from "@nodebooks/notebook-schema";
import type { NotebookStore } from "../types.js";
import { WorkerClient } from "@nodebooks/runtime-host";
import { getWorkerPool } from "../kernel/runtime-pool.js";
import { loadServerConfig } from "@nodebooks/config";

const encodePackagePath = (name: string) => {
  // Encode each path component while preserving slashes
  return name
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
};

const resolveVersion = async (name: string, version: string) => {
  const pkgPath = encodePackagePath(name);
  const spec = (version || "latest").trim() || "latest";
  const url = `https://registry.npmjs.org/${pkgPath}/${encodeURIComponent(spec)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    return null;
  }
  const json = (await res.json()) as { version?: string };
  const resolved = typeof json?.version === "string" ? json.version : null;
  return resolved;
};

export const registerDependencyRoutes = (
  app: FastifyInstance,
  store: NotebookStore
) => {
  app.post("/notebooks/:id/dependencies", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({ name: z.string().min(1), version: z.string().optional() })
      .parse(request.body ?? {});

    const notebook = await store.get(params.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    const resolved = await resolveVersion(body.name, body.version ?? "latest");
    if (!resolved) {
      reply.code(400);
      return {
        error: `Package ${body.name}@${body.version ?? "latest"} not found`,
      };
    }

    const previous = notebook.env.packages;
    const nextPackages = { ...previous, [body.name]: resolved };
    const updated = await store.save(
      ensureNotebookRuntimeVersion(
        NotebookSchema.parse({
          ...notebook,
          env: { ...notebook.env, packages: nextPackages },
        })
      )
    );

    // Trigger install immediately using a throwaway runtime instance
    try {
      const runtime = new WorkerClient(getWorkerPool());
      const { kernelTimeoutMs } = loadServerConfig();
      const result = await runtime.execute({
        cell: createCodeCell({ language: "js", source: "" }),
        code: "",
        notebookId: updated.id,
        env: updated.env,
        timeoutMs: kernelTimeoutMs,
      });
      return { data: { env: updated.env, outputs: result.outputs } };
    } catch (error) {
      // Roll back env change on failure
      await store.save(
        ensureNotebookRuntimeVersion(
          NotebookSchema.parse({
            ...notebook,
            env: { ...notebook.env, packages: previous },
          })
        )
      );
      reply.code(500);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to install dependencies";
      return { error: message };
    }

    // unreachable; handled above or in catch
  });

  app.delete("/notebooks/:id/dependencies/:name", async (request, reply) => {
    const params = z
      .object({ id: z.string(), name: z.string().min(1) })
      .parse(request.params);

    const notebook = await store.get(params.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    if (!(params.name in (notebook.env.packages ?? {}))) {
      // Nothing to remove, return current env
      return { data: { env: notebook.env } };
    }

    const previous = notebook.env.packages;
    const nextPackages = { ...previous };
    delete nextPackages[params.name];

    const updated = await store.save(
      ensureNotebookRuntimeVersion(
        NotebookSchema.parse({
          ...notebook,
          env: { ...notebook.env, packages: nextPackages },
        })
      )
    );

    try {
      const runtime = new WorkerClient(getWorkerPool());
      const { kernelTimeoutMs } = loadServerConfig();
      const result = await runtime.execute({
        cell: createCodeCell({ language: "js", source: "" }),
        code: "",
        notebookId: updated.id,
        env: updated.env,
        timeoutMs: kernelTimeoutMs,
      });
      return { data: { env: updated.env, outputs: result.outputs } };
    } catch (error) {
      // Roll back on failure
      await store.save(
        ensureNotebookRuntimeVersion(
          NotebookSchema.parse({
            ...notebook,
            env: { ...notebook.env, packages: previous },
          })
        )
      );
      reply.code(500);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update dependencies";
      return { error: message };
    }

    // unreachable; handled above or in catch
  });
};
