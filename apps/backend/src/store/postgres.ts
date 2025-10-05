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
  User,
  UserStore,
  CreateUserInput,
  UpdateUserInput,
  AuthSession,
  AuthSessionStore,
  Invitation,
  InvitationStore,
  CreateInvitationInput,
  NotebookCollaborator,
  NotebookCollaboratorStore,
  NotebookRole,
  Project,
  ProjectStore,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectCollaborator,
  ProjectCollaboratorStore,
  ProjectInvitation,
  ProjectInvitationStore,
  CreateProjectInvitationInput,
  ProjectRole,
} from "../types.js";
import { loadServerConfig } from "@nodebooks/config";

export interface PostgresNotebookStoreOptions {
  connectionString?: string;
  pool?: Pool;
}

const userNanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 18);

type NotebookRow = {
  data: unknown;
};

const mapProjectRow = (row: {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}): Project => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const mapProjectCollaboratorRow = (row: {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  created_at: Date;
  updated_at: Date;
}): ProjectCollaborator => ({
  id: row.id,
  projectId: row.project_id,
  userId: row.user_id,
  role: row.role as ProjectRole,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const mapProjectInvitationRow = (row: {
  id: string;
  email: string;
  project_id: string;
  role: string;
  token_hash: string;
  invited_by: string | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
}): ProjectInvitation => ({
  id: row.id,
  email: row.email,
  projectId: row.project_id,
  role: row.role as ProjectRole,
  tokenHash: row.token_hash,
  invitedBy: row.invited_by,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  expiresAt: row.expires_at.toISOString(),
  acceptedAt: row.accepted_at ? row.accepted_at.toISOString() : null,
  revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
});

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

  getPool(): Pool {
    return this.pool;
  }

  async ensureReady(): Promise<void> {
    await this.ready;
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

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_created_at
        ON projects (created_at ASC, id ASC)
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user
        ON user_sessions (user_id, updated_at DESC)
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS user_invitations (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        notebook_id TEXT REFERENCES notebooks(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_invitations_email
        ON user_invitations (email, created_at DESC, id ASC)
    `);

    await this.pool.query(
      `ALTER TABLE user_invitations
         ADD COLUMN IF NOT EXISTS notebook_id TEXT REFERENCES notebooks(id) ON DELETE CASCADE`
    );

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_invitations_notebook
        ON user_invitations (notebook_id, created_at DESC, id ASC)
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS notebook_collaborators (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE (notebook_id, user_id)
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_notebook_collaborators_user
        ON notebook_collaborators (user_id, notebook_id)
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS project_collaborators (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE (project_id, user_id)
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_project_collaborators_user
        ON project_collaborators (user_id, project_id)
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS project_invitations (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        invited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        accepted_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_project_invitations_email
        ON project_invitations (email, created_at DESC, id ASC)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_project_invitations_project
        ON project_invitations (project_id, created_at DESC, id ASC)
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

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    return new Date(value).toISOString();
  }
  return new Date(value as number).toISOString();
};

const toNullableIsoString = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  return toIsoString(value);
};

const mapPgUser = (row: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  password_hash: string;
  created_at: unknown;
  updated_at: unknown;
}): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role as User["role"],
  passwordHash: row.password_hash,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
});

export class PostgresUserStore implements UserStore {
  constructor(private readonly notebooks: PostgresNotebookStore) {}

  private async getPool(): Promise<Pool> {
    await this.notebooks.ensureReady();
    return this.notebooks.getPool();
  }

  async create(input: CreateUserInput): Promise<User> {
    const pool = await this.getPool();
    const now = new Date();
    const id = userNanoid();
    const email = input.email.trim().toLowerCase();
    const result = await pool.query(
      `INSERT INTO users (id, email, name, role, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, name, role, password_hash, created_at, updated_at`,
      [
        id,
        email,
        input.name?.trim() ?? null,
        input.role ?? "editor",
        input.passwordHash,
        now,
        now,
      ]
    );
    return mapPgUser(result.rows[0]!);
  }

  async get(id: string): Promise<User | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, name, role, password_hash, created_at, updated_at FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    const row = result.rows[0];
    return row ? mapPgUser(row) : undefined;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, name, role, password_hash, created_at, updated_at FROM users WHERE email = $1 LIMIT 1`,
      [email.trim().toLowerCase()]
    );
    const row = result.rows[0];
    return row ? mapPgUser(row) : undefined;
  }

  async update(id: string, updates: UpdateUserInput): Promise<User> {
    const pool = await this.getPool();
    const fields: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${index}`);
      values.push(updates.name?.trim() ?? null);
      index += 1;
    }
    if (typeof updates.passwordHash === "string") {
      fields.push(`password_hash = $${index}`);
      values.push(updates.passwordHash);
      index += 1;
    }
    if (updates.role) {
      fields.push(`role = $${index}`);
      values.push(updates.role);
      index += 1;
    }

    if (fields.length === 0) {
      const existing = await this.get(id);
      if (!existing) {
        throw new Error("User not found");
      }
      return existing;
    }

    const now = new Date();
    fields.push(`updated_at = $${index}`);
    values.push(now);
    index += 1;
    values.push(id);

    const updateSql = `UPDATE users SET ${fields.join(", ")} WHERE id = $${index} RETURNING id, email, name, role, password_hash, created_at, updated_at`;
    const result = await pool.query(updateSql, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error("User not found");
    }
    return mapPgUser(row);
  }

  async list(): Promise<User[]> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, name, role, password_hash, created_at, updated_at FROM users ORDER BY created_at ASC`
    );
    return result.rows.map(mapPgUser);
  }

  async count(): Promise<number> {
    const pool = await this.getPool();
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(1)::text as count FROM users`
    );
    const raw = result.rows[0]?.count ?? "0";
    return Number(raw);
  }
}

const mapPgSession = (row: {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: unknown;
  updated_at: unknown;
  expires_at: unknown;
  revoked_at: unknown;
}): AuthSession => ({
  id: row.id,
  userId: row.user_id,
  tokenHash: row.token_hash,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  expiresAt: toIsoString(row.expires_at),
  revokedAt: toNullableIsoString(row.revoked_at),
});

const mapPgInvitation = (row: {
  id: string;
  email: string;
  notebook_id: string | null;
  role: string;
  token_hash: string;
  invited_by: string | null;
  created_at: unknown;
  updated_at: unknown;
  expires_at: unknown;
  accepted_at: unknown;
  revoked_at: unknown;
}): Invitation => ({
  id: row.id,
  email: row.email,
  notebookId: row.notebook_id ?? "",
  role: row.role as Invitation["role"],
  tokenHash: row.token_hash,
  invitedBy: row.invited_by,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
  expiresAt: toIsoString(row.expires_at),
  acceptedAt: toNullableIsoString(row.accepted_at),
  revokedAt: toNullableIsoString(row.revoked_at),
});

const mapPgCollaborator = (row: {
  id: string;
  notebook_id: string;
  user_id: string;
  role: string;
  created_at: unknown;
  updated_at: unknown;
}): NotebookCollaborator => ({
  id: row.id,
  notebookId: row.notebook_id,
  userId: row.user_id,
  role: row.role as NotebookRole,
  createdAt: toIsoString(row.created_at),
  updatedAt: toIsoString(row.updated_at),
});

export class PostgresAuthSessionStore implements AuthSessionStore {
  constructor(private readonly notebooks: PostgresNotebookStore) {}

  private async getPool(): Promise<Pool> {
    await this.notebooks.ensureReady();
    return this.notebooks.getPool();
  }

  async create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<AuthSession> {
    const pool = await this.getPool();
    const now = new Date();
    const id = userNanoid();
    const result = await pool.query(
      `INSERT INTO user_sessions (id, user_id, token_hash, created_at, updated_at, expires_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL)
       RETURNING id, user_id, token_hash, created_at, updated_at, expires_at, revoked_at`,
      [id, input.userId, input.tokenHash, now, now, new Date(input.expiresAt)]
    );
    return mapPgSession(result.rows[0]!);
  }

  async findByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, user_id, token_hash, created_at, updated_at, expires_at, revoked_at FROM user_sessions WHERE token_hash = $1 LIMIT 1`,
      [tokenHash]
    );
    const row = result.rows[0];
    return row ? mapPgSession(row) : undefined;
  }

  async touch(id: string): Promise<void> {
    const pool = await this.getPool();
    await pool.query(`UPDATE user_sessions SET updated_at = $1 WHERE id = $2`, [
      new Date(),
      id,
    ]);
  }

  async revoke(id: string): Promise<void> {
    const pool = await this.getPool();
    await pool.query(`UPDATE user_sessions SET revoked_at = $1 WHERE id = $2`, [
      new Date(),
      id,
    ]);
  }

  async revokeForUser(userId: string): Promise<void> {
    const pool = await this.getPool();
    await pool.query(
      `UPDATE user_sessions SET revoked_at = $1 WHERE user_id = $2`,
      [new Date(), userId]
    );
  }
}

export class PostgresInvitationStore implements InvitationStore {
  constructor(private readonly notebooks: PostgresNotebookStore) {}

  private async getPool(): Promise<Pool> {
    await this.notebooks.ensureReady();
    return this.notebooks.getPool();
  }

  async create(input: CreateInvitationInput): Promise<Invitation> {
    const pool = await this.getPool();
    const now = new Date();
    const id = userNanoid();
    const email = input.email.trim().toLowerCase();
    const result = await pool.query(
      `INSERT INTO user_invitations (
         id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, NULL, NULL)
       RETURNING id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at`,
      [
        id,
        email,
        input.notebookId,
        input.role,
        input.tokenHash,
        input.invitedBy ?? null,
        now,
        new Date(input.expiresAt),
      ]
    );
    return mapPgInvitation(result.rows[0]!);
  }

  async get(id: string): Promise<Invitation | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    const row = result.rows[0];
    return row ? mapPgInvitation(row) : undefined;
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );
    const row = result.rows[0];
    return row ? mapPgInvitation(row) : undefined;
  }

  async findActiveByEmail(
    email: string,
    notebookId: string
  ): Promise<Invitation | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE email = $1 AND notebook_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [email.trim().toLowerCase(), notebookId]
    );
    const row = result.rows[0];
    if (!row) {
      return undefined;
    }
    const invitation = mapPgInvitation(row);
    if (invitation.acceptedAt || invitation.revokedAt) {
      return undefined;
    }
    return invitation;
  }

  async list(): Promise<Invitation[]> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       ORDER BY created_at DESC, id DESC`
    );
    return result.rows.map(mapPgInvitation);
  }

  async listByNotebook(notebookId: string): Promise<Invitation[]> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE notebook_id = $1
       ORDER BY created_at DESC, id DESC`,
      [notebookId]
    );
    return result.rows.map(mapPgInvitation);
  }

  async markAccepted(id: string): Promise<Invitation | undefined> {
    const pool = await this.getPool();
    const now = new Date();
    const result = await pool.query(
      `UPDATE user_invitations
       SET accepted_at = $1, updated_at = $1
       WHERE id = $2
       RETURNING id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at`,
      [now, id]
    );
    const row = result.rows[0];
    return row ? mapPgInvitation(row) : undefined;
  }

  async revoke(id: string): Promise<Invitation | undefined> {
    const pool = await this.getPool();
    const now = new Date();
    const result = await pool.query(
      `UPDATE user_invitations
       SET revoked_at = $1, updated_at = $1
       WHERE id = $2
       RETURNING id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at`,
      [now, id]
    );
    const row = result.rows[0];
    return row ? mapPgInvitation(row) : undefined;
  }
}

export class PostgresNotebookCollaboratorStore
  implements NotebookCollaboratorStore
{
  constructor(private readonly notebooks: PostgresNotebookStore) {}

  private async getPool(): Promise<Pool> {
    await this.notebooks.ensureReady();
    return this.notebooks.getPool();
  }

  async listByNotebook(notebookId: string): Promise<NotebookCollaborator[]> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, notebook_id, user_id, role, created_at, updated_at
       FROM notebook_collaborators
       WHERE notebook_id = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [notebookId]
    );
    return result.rows.map(mapPgCollaborator);
  }

  async listNotebookIdsForUser(userId: string): Promise<string[]> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT notebook_id
       FROM notebook_collaborators
       WHERE user_id = $1
       ORDER BY notebook_id ASC`,
      [userId]
    );
    return result.rows.map((row) => row.notebook_id as string);
  }

  async listForUser(userId: string): Promise<NotebookCollaborator[]> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, notebook_id, user_id, role, created_at, updated_at
       FROM notebook_collaborators
       WHERE user_id = $1
       ORDER BY notebook_id ASC`,
      [userId]
    );
    return result.rows.map(mapPgCollaborator);
  }

  async get(
    notebookId: string,
    userId: string
  ): Promise<NotebookCollaborator | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, notebook_id, user_id, role, created_at, updated_at
       FROM notebook_collaborators
       WHERE notebook_id = $1 AND user_id = $2
       LIMIT 1`,
      [notebookId, userId]
    );
    const row = result.rows[0];
    return row ? mapPgCollaborator(row) : undefined;
  }

  async upsert(input: {
    notebookId: string;
    userId: string;
    role: NotebookRole;
  }): Promise<NotebookCollaborator> {
    const pool = await this.getPool();
    const now = new Date();
    const id = userNanoid();
    const result = await pool.query(
      `INSERT INTO notebook_collaborators (
         id, notebook_id, user_id, role, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $5)
       ON CONFLICT (notebook_id, user_id) DO UPDATE SET
         role = EXCLUDED.role,
         updated_at = EXCLUDED.updated_at
       RETURNING id, notebook_id, user_id, role, created_at, updated_at`,
      [id, input.notebookId, input.userId, input.role, now]
    );
    return mapPgCollaborator(result.rows[0]!);
  }

  async updateRole(
    notebookId: string,
    userId: string,
    role: NotebookRole
  ): Promise<NotebookCollaborator | undefined> {
    const pool = await this.getPool();
    const now = new Date();
    const result = await pool.query(
      `UPDATE notebook_collaborators
       SET role = $1, updated_at = $2
       WHERE notebook_id = $3 AND user_id = $4
       RETURNING id, notebook_id, user_id, role, created_at, updated_at`,
      [role, now, notebookId, userId]
    );
    const row = result.rows[0];
    return row ? mapPgCollaborator(row) : undefined;
  }

  async remove(notebookId: string, userId: string): Promise<boolean> {
    const pool = await this.getPool();
    const result = await pool.query(
      `DELETE FROM notebook_collaborators
       WHERE notebook_id = $1 AND user_id = $2`,
      [notebookId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresProjectStore implements ProjectStore {
  constructor(private readonly notebooks: PostgresNotebookStore) {}

  private async getPool(): Promise<Pool> {
    await this.notebooks.ensureReady();
    return this.notebooks.getPool();
  }

  async list(): Promise<Project[]> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, name, created_at, updated_at
       FROM projects
       ORDER BY created_at ASC, id ASC`
    );
    return result.rows.map(mapProjectRow);
  }

  async get(id: string): Promise<Project | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, name, created_at, updated_at
       FROM projects
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    const row = result.rows[0];
    return row ? mapProjectRow(row) : undefined;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const pool = await this.getPool();
    const now = new Date();
    const result = await pool.query(
      `INSERT INTO projects (id, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, created_at, updated_at`,
      [userNanoid(), input.name.trim(), now, now]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to create project");
    }
    return mapProjectRow(row);
  }

  async update(id: string, updates: UpdateProjectInput): Promise<Project> {
    const pool = await this.getPool();
    const fields: string[] = [];
    const values: unknown[] = [];
    if (typeof updates.name === "string") {
      fields.push(`name = $${fields.length + 2}`);
      values.push(updates.name.trim());
    }
    if (fields.length === 0) {
      const current = await this.get(id);
      if (!current) {
        throw new Error("Project not found");
      }
      return current;
    }
    const updatedAt = new Date();
    fields.push(`updated_at = $${fields.length + 2}`);
    values.push(updatedAt);
    const result = await pool.query(
      `UPDATE projects
         SET ${fields.join(", ")}
       WHERE id = $1
       RETURNING id, name, created_at, updated_at`,
      [id, ...values]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Project not found");
    }
    return mapProjectRow(row);
  }

  async remove(id: string): Promise<boolean> {
    const pool = await this.getPool();
    const result = await pool.query(`DELETE FROM projects WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }
}

export class PostgresProjectCollaboratorStore
  implements ProjectCollaboratorStore
{
  constructor(private readonly notebooks: PostgresNotebookStore) {}

  private async getPool(): Promise<Pool> {
    await this.notebooks.ensureReady();
    return this.notebooks.getPool();
  }

  async listByProject(projectId: string): Promise<ProjectCollaborator[]> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, project_id, user_id, role, created_at, updated_at
       FROM project_collaborators
       WHERE project_id = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [projectId]
    );
    return result.rows.map(mapProjectCollaboratorRow);
  }

  async listProjectIdsForUser(userId: string): Promise<string[]> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT project_id
       FROM project_collaborators
       WHERE user_id = $1
       ORDER BY project_id ASC`,
      [userId]
    );
    return result.rows.map((row) => row.project_id);
  }

  async get(
    projectId: string,
    userId: string
  ): Promise<ProjectCollaborator | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, project_id, user_id, role, created_at, updated_at
       FROM project_collaborators
       WHERE project_id = $1 AND user_id = $2
       LIMIT 1`,
      [projectId, userId]
    );
    const row = result.rows[0];
    return row ? mapProjectCollaboratorRow(row) : undefined;
  }

  async upsert(input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
  }): Promise<ProjectCollaborator> {
    const pool = await this.getPool();
    const now = new Date();
    const result = await pool.query(
      `INSERT INTO project_collaborators (
         id, project_id, user_id, role, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id, user_id) DO UPDATE SET
         role = EXCLUDED.role,
         updated_at = EXCLUDED.updated_at
       RETURNING id, project_id, user_id, role, created_at, updated_at`,
      [userNanoid(), input.projectId, input.userId, input.role, now, now]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to upsert project collaborator");
    }
    return mapProjectCollaboratorRow(row);
  }

  async updateRole(
    projectId: string,
    userId: string,
    role: ProjectRole
  ): Promise<ProjectCollaborator | undefined> {
    const pool = await this.getPool();
    const updatedAt = new Date();
    const result = await pool.query(
      `UPDATE project_collaborators
         SET role = $1, updated_at = $2
       WHERE project_id = $3 AND user_id = $4
       RETURNING id, project_id, user_id, role, created_at, updated_at`,
      [role, updatedAt, projectId, userId]
    );
    const row = result.rows[0];
    return row ? mapProjectCollaboratorRow(row) : undefined;
  }

  async remove(projectId: string, userId: string): Promise<boolean> {
    const pool = await this.getPool();
    const result = await pool.query(
      `DELETE FROM project_collaborators
       WHERE project_id = $1 AND user_id = $2`,
      [projectId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async removeAllForProject(projectId: string): Promise<void> {
    const pool = await this.getPool();
    await pool.query(
      `DELETE FROM project_collaborators WHERE project_id = $1`,
      [projectId]
    );
  }
}

export class PostgresProjectInvitationStore implements ProjectInvitationStore {
  constructor(private readonly notebooks: PostgresNotebookStore) {}

  private async getPool(): Promise<Pool> {
    await this.notebooks.ensureReady();
    return this.notebooks.getPool();
  }

  async create(
    input: CreateProjectInvitationInput
  ): Promise<ProjectInvitation> {
    const pool = await this.getPool();
    const now = new Date();
    const result = await pool.query(
      `INSERT INTO project_invitations (
         id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL)
       RETURNING id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at`,
      [
        userNanoid(),
        input.email.trim().toLowerCase(),
        input.projectId,
        input.role,
        input.tokenHash,
        input.invitedBy ?? null,
        now,
        now,
        new Date(input.expiresAt),
      ]
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to create project invitation");
    }
    return mapProjectInvitationRow(row);
  }

  async get(id: string): Promise<ProjectInvitation | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM project_invitations
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    const row = result.rows[0];
    return row ? mapProjectInvitationRow(row) : undefined;
  }

  async findByTokenHash(
    tokenHash: string
  ): Promise<ProjectInvitation | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM project_invitations
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );
    const row = result.rows[0];
    return row ? mapProjectInvitationRow(row) : undefined;
  }

  async findActiveByEmail(
    email: string,
    projectId: string
  ): Promise<ProjectInvitation | undefined> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM project_invitations
       WHERE email = $1 AND project_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [email.trim().toLowerCase(), projectId]
    );
    const row = result.rows[0];
    return row ? mapProjectInvitationRow(row) : undefined;
  }

  async list(): Promise<ProjectInvitation[]> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM project_invitations
       ORDER BY created_at DESC, id DESC`
    );
    return result.rows.map(mapProjectInvitationRow);
  }

  async listByProject(projectId: string): Promise<ProjectInvitation[]> {
    const pool = await this.getPool();
    const result = await pool.query(
      `SELECT id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM project_invitations
       WHERE project_id = $1
       ORDER BY created_at DESC, id DESC`,
      [projectId]
    );
    return result.rows.map(mapProjectInvitationRow);
  }

  async markAccepted(id: string): Promise<ProjectInvitation | undefined> {
    const pool = await this.getPool();
    const now = new Date();
    const result = await pool.query(
      `UPDATE project_invitations
         SET accepted_at = $1, updated_at = $1
       WHERE id = $2
       RETURNING id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at`,
      [now, id]
    );
    const row = result.rows[0];
    return row ? mapProjectInvitationRow(row) : undefined;
  }

  async revoke(id: string): Promise<ProjectInvitation | undefined> {
    const pool = await this.getPool();
    const now = new Date();
    const result = await pool.query(
      `UPDATE project_invitations
         SET revoked_at = $1, updated_at = $1
       WHERE id = $2
       RETURNING id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at`,
      [now, id]
    );
    const row = result.rows[0];
    return row ? mapProjectInvitationRow(row) : undefined;
  }
}
