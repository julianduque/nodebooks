import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createCodeCell,
  createEmptyNotebook,
  createMarkdownCell,
  NotebookCellSchema,
  NotebookEnvSchema,
  NotebookSchema,
} from "@nodebooks/notebook-schema";
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

export const registerNotebookRoutes = (
  app: FastifyInstance,
  store: NotebookStore,
) => {
  app.get("/notebooks", async () => {
    return {
      data: store.all(),
    };
  });

  app.get("/notebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const notebook = store.get(params.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    return { data: notebook };
  });

  app.post("/notebooks", async (request, reply) => {
    const body = NotebookCreateSchema.parse(request.body ?? {});

    const base = createEmptyNotebook({ name: body.name });

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
              source: "const greeting: string = 'Hello, NodeBooks!';\nconsole.log(greeting);",
            }),
          ];
          break;
        default:
          cells = [
            createMarkdownCell({
              source: "# Welcome to NodeBooks\nRun the code cell below to get started.",
            }),
            createCodeCell({
              source: "console.log('2 + 2 =', 2 + 2);",
            }),
          ];
      }
    }

    const notebook = store.save(
      NotebookSchema.parse({
        ...base,
        env: body.env ?? base.env,
        cells,
      }),
    );

    reply.code(201);
    return { data: notebook };
  });

  app.put("/notebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const notebook = store.get(params.id);
    if (!notebook) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    const body = NotebookMutationSchema.parse(request.body ?? {});

    const updated = store.save({
      ...notebook,
      ...body,
      env: body.env ?? notebook.env,
      cells: body.cells ?? notebook.cells,
    });

    return { data: updated };
  });

  app.delete("/notebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const deleted = store.remove(params.id);
    if (!deleted) {
      reply.code(404);
      return { error: "Notebook not found" };
    }

    return { data: deleted };
  });
};
