import { Pool } from "pg";
import {
  ensureNotebookRuntimeVersion,
  NotebookSchema,
  type Notebook,
} from "@nodebooks/notebook-schema";
import type { NotebookStore } from "../types.js";

export interface PostgresNotebookStoreOptions {
  connectionString?: string;
  pool?: Pool;
}

type NotebookRow = {
  data: unknown;
};

type SslConfig = { rejectUnauthorized: boolean };

const parseSslConfig = (
  connectionString: string | undefined
): SslConfig | undefined => {
  if (!connectionString) {
    return undefined;
  }

  try {
    const url = new URL(connectionString);
    const sslParam =
      url.searchParams.get("sslmode") ??
      url.searchParams.get("ssl") ??
      undefined;
    if (!sslParam) {
      return { rejectUnauthorized: false };
    }

    const normalized = sslParam.trim().toLowerCase();
    if (["disable", "false", "0"].includes(normalized)) {
      return undefined;
    }
    if (["verify-full", "verify-ca"].includes(normalized)) {
      return { rejectUnauthorized: true };
    }
    return { rejectUnauthorized: false };
  } catch {
    return undefined;
  }
};

export class PostgresNotebookStore implements NotebookStore {
  private readonly pool: Pool;
  private readonly ready: Promise<void>;
  private readonly managePool: boolean;

  constructor(options: PostgresNotebookStoreOptions = {}) {
    if (options.pool) {
      this.pool = options.pool;
      this.managePool = false;
    } else {
      const connectionString =
        options.connectionString ?? process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error(
          "DATABASE_URL must be set when NODEBOOKS_PERSISTENCE=postgres"
        );
      }

      const ssl = parseSslConfig(connectionString);
      this.pool = new Pool(
        ssl
          ? {
              connectionString,
              ssl,
            }
          : { connectionString }
      );
      this.managePool = true;
    }

    this.ready = this.initialize();
  }

  async all(): Promise<Notebook[]> {
    await this.ready;
    const result = await this.pool.query<NotebookRow>(
      "SELECT data FROM notebooks ORDER BY updated_at DESC, id ASC"
    );
    return result.rows.map((row) => this.deserialize(row.data));
  }

  async get(id: string): Promise<Notebook | undefined> {
    await this.ready;
    const result = await this.pool.query<NotebookRow>(
      "SELECT data FROM notebooks WHERE id = $1 LIMIT 1",
      [id]
    );
    const row = result.rows[0];
    return row ? this.deserialize(row.data) : undefined;
  }

  async save(notebook: Notebook): Promise<Notebook> {
    await this.ready;
    const parsed = ensureNotebookRuntimeVersion(
      NotebookSchema.parse({
        ...notebook,
        updatedAt: new Date().toISOString(),
      })
    );

    await this.pool.query(
      `INSERT INTO notebooks (id, name, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         data = EXCLUDED.data,
         updated_at = EXCLUDED.updated_at`,
      [parsed.id, parsed.name, parsed, parsed.createdAt, parsed.updatedAt]
    );

    return parsed;
  }

  async remove(id: string): Promise<Notebook | undefined> {
    await this.ready;
    const existing = await this.get(id);
    if (!existing) {
      return undefined;
    }

    await this.pool.query("DELETE FROM notebooks WHERE id = $1", [id]);
    return existing;
  }

  async close(): Promise<void> {
    if (!this.managePool) {
      return;
    }
    await this.pool.end();
  }

  private async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS notebooks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notebooks_updated_at
        ON notebooks (updated_at DESC, id ASC)
    `);
  }

  private deserialize(raw: unknown): Notebook {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return ensureNotebookRuntimeVersion(NotebookSchema.parse(value));
  }
}
