import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createCodeCell,
  createEmptyNotebook,
  createMarkdownCell,
  ensureNotebookRuntimeVersion,
  NotebookCellSchema,
  NotebookEnvSchema,
  NotebookSchema,
} from "@nodebooks/notebook-schema";
import type { Notebook } from "@nodebooks/notebook-schema";
import type { NotebookStore } from "../types.js";

const NotebookMutationSchema = z.object({
  name: z.string().min(1).optional(),
  env: NotebookEnvSchema.optional(),
  cells: z.array(NotebookCellSchema).optional(),
});

const NotebookCreateSchema = NotebookMutationSchema.extend({
  template: z
    .enum(["blank", "starter", "typescript"])
    .default("starter")
    .optional(),
});

const formatNotebook = (notebook: Notebook) => {
  return ensureNotebookRuntimeVersion(notebook);
};

export const registerNotebookRoutes = (
  app: FastifyInstance,
  store: NotebookStore
) => {
  app.get("/notebooks", async () => {
    return {
      data: (await store.all()).map(formatNotebook),
    };
  });

  app.get("/notebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const notebook = await store.get(params.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    return { data: formatNotebook(notebook) };
  });

  app.post("/notebooks", async (request, reply) => {
    const body = NotebookCreateSchema.parse(request.body ?? {});

    const base = createEmptyNotebook(
      body.name ? { name: body.name } : undefined
    );

    let cells = body.cells ?? [];
    if (cells.length === 0) {
      switch (body.template ?? "starter") {
        case "blank":
          cells = [createMarkdownCell({ source: "# New Notebook" })];
          break;
        case "typescript":
          cells = [
            createMarkdownCell({ source: "# TypeScript Notebook" }),
            createCodeCell({
              language: "ts",
              source:
                "const greeting: string = 'Hello, NodeBooks!';\nconsole.log(greeting);",
            }),
          ];
          break;
        default:
          cells = [
            createMarkdownCell({
              source:
                "# Welcome to NodeBooks\nRun the code cell below to get started.",
            }),
            createCodeCell({
              source: "console.log('2 + 2 =', 2 + 2);",
            }),
          ];
      }
    }

    const parsed = NotebookSchema.parse({
      ...base,
      env: body.env ? { ...base.env, ...body.env } : base.env,
      cells,
    });

    const notebook = await store.save(formatNotebook(parsed));

    reply.code(201);
    return { data: formatNotebook(notebook) };
  });

  app.put("/notebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const notebook = await store.get(params.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    const body = NotebookMutationSchema.parse(request.body ?? {});

    const updated = await store.save(
      formatNotebook({
        ...notebook,
        ...body,
        env: body.env ?? notebook.env,
        cells: body.cells ?? notebook.cells,
      })
    );

    return { data: formatNotebook(updated) };
  });

  app.delete("/notebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const deleted = await store.remove(params.id);
    if (!deleted) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    return { data: deleted ? formatNotebook(deleted) : deleted };
  });
};
