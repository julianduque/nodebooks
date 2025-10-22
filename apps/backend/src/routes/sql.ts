import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Client, type ClientConfig, types as pgTypes } from "pg";
import {
  NotebookSqlSchema,
  SqlResultSchema,
  type Notebook,
  type SqlConnection,
} from "@nodebooks/notebook-schema";
import type { NotebookCollaboratorStore, NotebookStore } from "../types.js";
import { ensureNotebookAccess } from "../notebooks/permissions.js";

const SqlExecutePayloadSchema = z.object({
  cellId: z.string(),
  connectionId: z.string(),
  query: z.string(),
  assignVariable: z.string().optional(),
});

const PG_TYPE_NAME_BY_ID = (() => {
  const map = new Map<number, string>();
  const entries = Object.entries(pgTypes.builtins ?? {});
  for (const [name, id] of entries) {
    if (typeof id === "number") {
      map.set(id, name.toLowerCase());
    }
  }
  return map;
})();

const lookupPostgresTypeName = (id: number) => {
  return PG_TYPE_NAME_BY_ID.get(id) ?? String(id);
};

const isValidVariableName = (value: string) =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);

const buildPostgresClient = (connectionString: string) => {
  const config: ClientConfig = { connectionString };
  try {
    const url = new URL(connectionString);
    const sslParam =
      url.searchParams.get("sslmode") ?? url.searchParams.get("ssl") ?? undefined;
    if (sslParam) {
      const normalized = sslParam.trim().toLowerCase();
      if (["disable", "false", "0"].includes(normalized)) {
        // no-op
      } else if (["verify-full", "verify-ca"].includes(normalized)) {
        config.ssl = { rejectUnauthorized: true };
      } else {
        config.ssl = { rejectUnauthorized: false };
      }
    }
  } catch {
    // ignore malformed URLs and rely on pg defaults
  }
  return new Client(config);
};

const toPlainRows = (rows: Array<Record<string, unknown>>) => {
  return rows.map((row) => ({ ...row }));
};

const ensureNotebookSql = (notebook: Notebook) => {
  return NotebookSqlSchema.parse(notebook.sql ?? {});
};

export const registerSqlRoutes = (
  app: FastifyInstance,
  store: NotebookStore,
  collaborators: NotebookCollaboratorStore
) => {
  app.post(
    "/notebooks/:id/sql",
    async (request, reply): Promise<void> => {
      const params = z.object({ id: z.string().min(1) }).safeParse(request.params);
      if (!params.success) {
        void reply.code(400).send({ error: "Invalid notebook id" });
        return;
      }
      const notebook = await store.get(params.data.id);
      if (!notebook) {
        void reply.code(404).send({ error: "Notebook not found" });
        return;
      }

      const accessRole = await ensureNotebookAccess(
        request,
        reply,
        collaborators,
        notebook.id,
        "editor"
      );
      if (!accessRole && request.user?.role !== "admin") {
        return;
      }

      const payload = SqlExecutePayloadSchema.safeParse(request.body ?? {});
      if (!payload.success) {
        void reply.code(400).send({ error: "Invalid SQL payload" });
        return;
      }

      const queryText = payload.data.query.trim();
      if (queryText.length === 0) {
        void reply.code(400).send({ error: "SQL query cannot be empty" });
        return;
      }

      const assignRaw = payload.data.assignVariable?.trim();
      const assignVariable = assignRaw && assignRaw.length > 0 ? assignRaw : undefined;
      if (assignVariable && !isValidVariableName(assignVariable)) {
        void reply.code(400).send({ error: "Assignment target must be a valid identifier" });
        return;
      }

      const sqlConfig = ensureNotebookSql(notebook);
      const connection: SqlConnection | undefined = sqlConfig.connections.find(
        (candidate) => candidate.id === payload.data.connectionId
      );
      if (!connection) {
        void reply.code(400).send({ error: "Database connection not found" });
        return;
      }
      if (connection.driver !== "postgres") {
        void reply.code(400).send({ error: `Unsupported SQL driver: ${connection.driver}` });
        return;
      }
      const connectionString = connection.config.connectionString?.trim();
      if (!connectionString) {
        void reply.code(400).send({ error: "Connection string is required" });
        return;
      }

      const client = buildPostgresClient(connectionString);
      const started = Date.now();
      try {
        await client.connect();
        const result = await client.query(queryText);
        const durationMs = Date.now() - started;
        const rows = toPlainRows(result.rows ?? []);
        const columns = (result.fields ?? []).map((field) => ({
          name: field.name,
          dataType: lookupPostgresTypeName(field.dataTypeID),
        }));
        const parsedResult = SqlResultSchema.parse({
          rowCount:
            typeof result.rowCount === "number" ? result.rowCount : rows.length,
          durationMs,
          rows,
          columns,
          assignedVariable: assignVariable,
          timestamp: new Date().toISOString(),
        });
        void reply.send({ data: { result: parsedResult } });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to execute SQL query";
        const result = SqlResultSchema.parse({
          error: message,
          assignedVariable: assignVariable,
          timestamp: new Date().toISOString(),
        });
        void reply.code(400).send({ data: { result }, error: message });
      } finally {
        try {
          await client.end();
        } catch {
          // ignore disconnect failures
        }
      }
    }
  );
};
