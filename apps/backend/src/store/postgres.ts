import { Pool } from "pg";
import { customAlphabet } from "nanoid";
import {
  ensureNotebookRuntimeVersion,
  NotebookSchema,
  type Notebook,
} from "@nodebooks/notebook-schema";
import type {
  NotebookAttachment,
  NotebookAttachmentContent,
  NotebookStore,
  SettingsStore,
} from "../types.js";
import { loadServerConfig } from "@nodebooks/config";

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
  private readonly nanoid = customAlphabet(
    "1234567890abcdefghijklmnopqrstuvwxyz",
    12
  );

  constructor(options: PostgresNotebookStoreOptions = {}) {
    if (options.pool) {
      this.pool = options.pool;
      this.managePool = false;
    } else {
      const connectionString =
        options.connectionString ?? loadServerConfig().persistence.databaseUrl;
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

  async listAttachments(notebookId: string): Promise<NotebookAttachment[]> {
    await this.ready;
    const result = await this.pool.query<{
      id: string;
      notebook_id: string;
      filename: string;
      mime_type: string;
      size: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, notebook_id, filename, mime_type, size, created_at, updated_at
       FROM attachments
       WHERE notebook_id = $1
       ORDER BY created_at DESC, id ASC`,
      [notebookId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      notebookId: row.notebook_id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: Number(row.size),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async getAttachment(
    notebookId: string,
    attachmentId: string
  ): Promise<NotebookAttachmentContent | undefined> {
    await this.ready;
    const result = await this.pool.query<{
      id: string;
      notebook_id: string;
      filename: string;
      mime_type: string;
      size: string;
      content: Buffer;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, notebook_id, filename, mime_type, size, content, created_at, updated_at
       FROM attachments
       WHERE notebook_id = $1 AND id = $2
       LIMIT 1`,
      [notebookId, attachmentId]
    );

    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      notebookId: row.notebook_id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: Number(row.size),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      content: row.content,
    };
  }

  async saveAttachment(
    notebookId: string,
    input: {
      filename: string;
      mimeType: string;
      content: Uint8Array;
    }
  ): Promise<NotebookAttachment> {
    await this.ready;
    if (!(await this.get(notebookId))) {
      throw new Error(`Notebook ${notebookId} not found`);
    }

    const id = this.nanoid();
    const now = new Date();
    const buffer = Buffer.from(input.content);

    await this.pool.query(
      `INSERT INTO attachments (
        id, notebook_id, filename, mime_type, size, content, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        notebookId,
        input.filename,
        input.mimeType,
        buffer.byteLength,
        buffer,
        now,
        now,
      ]
    );

    return {
      id,
      notebookId,
      filename: input.filename,
      mimeType: input.mimeType,
      size: buffer.byteLength,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  async removeAttachment(
    notebookId: string,
    attachmentId: string
  ): Promise<boolean> {
    await this.ready;
    const result = await this.pool.query(
      "DELETE FROM attachments WHERE notebook_id = $1 AND id = $2",
      [notebookId, attachmentId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async close(): Promise<void> {
    if (!this.managePool) {
      return;
    }
    await this.pool.end();
  }

  async ensureReady(): Promise<void> {
    await this.ready;
  }

  getPool(): Pool {
    return this.pool;
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

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size BIGINT NOT NULL,
        content BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_attachments_notebook
        ON attachments (notebook_id, created_at DESC, id ASC)
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_settings_updated_at
        ON settings (updated_at DESC, key ASC)
    `);
  }

  private deserialize(raw: unknown): Notebook {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return ensureNotebookRuntimeVersion(NotebookSchema.parse(value));
  }
}

export class PostgresSettingsStore implements SettingsStore {
  constructor(private readonly notebooks: PostgresNotebookStore) {}

  private async getPool(): Promise<Pool> {
    await this.notebooks.ensureReady();
    return this.notebooks.getPool();
  }

  async all(): Promise<Record<string, unknown>> {
    const pool = await this.getPool();
    const result = await pool.query<{ key: string; value: unknown }>(
      "SELECT key, value FROM settings"
    );
    return result.rows.reduce<Record<string, unknown>>((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const pool = await this.getPool();
    const result = await pool.query<{ value: unknown }>(
      "SELECT value FROM settings WHERE key = $1 LIMIT 1",
      [key]
    );
    const row = result.rows[0];
    return (row?.value ?? undefined) as T | undefined;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    if (value === undefined) {
      await this.delete(key);
      return;
    }
    const pool = await this.getPool();
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = EXCLUDED.updated_at`,
      [key, value ?? null, new Date().toISOString()]
    );
  }

  async delete(key: string): Promise<void> {
    const pool = await this.getPool();
    await pool.query("DELETE FROM settings WHERE key = $1", [key]);
  }
}
