import { z } from "zod";

/**
 * SQL driver enum.
 */
export const SqlDriverSchema = z.enum(["postgres"]);
export type SqlDriver = z.infer<typeof SqlDriverSchema>;

/**
 * PostgreSQL connection schema.
 */
const SqlPostgresConnectionSchema = z.object({
  id: z.string(),
  driver: z.literal("postgres"),
  name: z.string().default(""),
  config: z
    .object({
      connectionString: z.string().default(""),
    })
    .default({ connectionString: "" }),
});

/**
 * SQL connection schema (supports multiple drivers).
 */
export const SqlConnectionSchema = z.discriminatedUnion("driver", [
  SqlPostgresConnectionSchema,
]);
export type SqlConnection = z.infer<typeof SqlConnectionSchema>;

/**
 * Notebook SQL configuration schema.
 */
export const NotebookSqlSchema = z.object({
  connections: z.array(SqlConnectionSchema).default([]),
});
export type NotebookSql = z.infer<typeof NotebookSqlSchema>;

/**
 * SQL column metadata schema.
 */
export const SqlColumnSchema = z.object({
  name: z.string(),
  dataType: z.string().optional(),
});
export type SqlColumn = z.infer<typeof SqlColumnSchema>;

/**
 * SQL query result schema.
 */
export const SqlResultSchema = z.object({
  rowCount: z.number().int().nonnegative().optional(),
  durationMs: z.number().nonnegative().optional(),
  columns: z.array(SqlColumnSchema).default([]),
  rows: z.array(z.record(z.string(), z.unknown())).default([]),
  assignedVariable: z.string().optional(),
  timestamp: z.string().optional(),
  error: z.string().optional(),
});
export type SqlResult = z.infer<typeof SqlResultSchema>;

/**
 * SQL cell schema - Execute SQL queries against databases.
 */
export const SqlCellSchema = z.object({
  id: z.string(),
  type: z.literal("sql"),
  metadata: z.record(z.string(), z.unknown()).default({}),
  connectionId: z.string().optional(),
  query: z.string().default(""),
  assignVariable: z.string().optional(),
  result: SqlResultSchema.optional(),
});
export type SqlCell = z.infer<typeof SqlCellSchema>;

const createId = (): string => {
  if (
    typeof globalThis.crypto !== "undefined" &&
    "randomUUID" in globalThis.crypto
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `nb_${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Factory function to create a new SQL cell.
 */
export const createSqlCell = (partial?: Partial<SqlCell>): SqlCell => {
  return SqlCellSchema.parse({
    id: partial?.id ?? createId(),
    type: "sql",
    metadata: partial?.metadata ?? {},
    connectionId: partial?.connectionId,
    query: partial?.query ?? "",
    assignVariable: partial?.assignVariable,
    result: partial?.result,
  });
};

/**
 * SQL cell file schema - For notebook file serialization.
 */
export const NotebookFileSqlCellSchema = z.object({
  type: z.literal("sql"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  connectionId: z.string().optional(),
  query: z.string().optional(),
  assignVariable: z.string().optional(),
  result: SqlResultSchema.optional(),
});
export type NotebookFileSqlCell = z.infer<typeof NotebookFileSqlCellSchema>;
