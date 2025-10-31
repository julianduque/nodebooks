import type { SqlCell, SqlConnection } from "../schema.js";

const sanitizeSqlTemplateLiteral = (value: string) => {
  return (value ?? "").replace(/\\/g, "\\\\").replace(/`/g, "\\`");
};

const toSqlTemplateLiteral = (value: string) => {
  return `\`${sanitizeSqlTemplateLiteral(value)}\``;
};

const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const extractEnvPlaceholder = (value: string | undefined | null) => {
  if (!value) return null;
  const match = value.match(/\{\{\s*([A-Z0-9_]+)\s*\}\}/i);
  if (!match) return null;
  return match[1]?.toUpperCase() ?? null;
};

const resolveFallbackEnvKey = (variables?: Record<string, string>) => {
  if (variables) {
    const keys = Object.keys(variables).map((key) => key.toUpperCase());
    const preferred =
      keys.find((key) => key === "DATABASE_URL") ??
      keys.find((key) => key.endsWith("_DATABASE_URL")) ??
      keys.find((key) => key.includes("DATABASE")) ??
      keys.find((key) => key.includes("POSTGRES")) ??
      keys.find((key) => key.includes("PG"));
    if (preferred) {
      return preferred;
    }
  }
  return "DATABASE_URL";
};

type SqlCellLike = Pick<SqlCell, "connectionId" | "query" | "assignVariable">;

export const buildSqlCodeSnippet = (
  cell: SqlCellLike,
  connections: SqlConnection[],
  variables: Record<string, string> | undefined
) => {
  const connection = cell.connectionId
    ? connections.find((item) => item.id === cell.connectionId)
    : undefined;
  const query = (cell.query ?? "").trim() || "select 1";
  const assign = (cell.assignVariable ?? "").trim();
  const assignTarget = SQL_IDENTIFIER_PATTERN.test(assign) ? assign : null;
  const connectionString = connection?.config?.connectionString?.trim();

  const lines: string[] = [];
  lines.push('import { Client } from "pg";');
  lines.push("", "const client = new Client({");

  if (connectionString) {
    const envKey = extractEnvPlaceholder(connectionString);
    if (envKey) {
      lines.push(`  connectionString: process.env.${envKey} ?? "",`);
    } else {
      lines.push(`  connectionString: ${JSON.stringify(connectionString)},`);
    }
  } else {
    const fallbackEnv = resolveFallbackEnvKey(variables);
    lines.push(`  connectionString: process.env.${fallbackEnv} ?? "",`);
  }
  lines.push("});", "", "await client.connect();", "try {");
  lines.push(
    `  const result = await client.query(${toSqlTemplateLiteral(query)});`
  );
  if (assignTarget) {
    lines.push(`  const ${assignTarget} = result.rows;`);
  }
  lines.push(
    "  console.log(result.rows);",
    "} finally {",
    "  await client.end();",
    "}"
  );

  return lines.join("\n");
};
