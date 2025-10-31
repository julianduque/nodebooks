import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import { customAlphabet } from "nanoid";
import {
  ensureNotebookRuntimeVersion,
  normalizeSlug,
  suggestSlug,
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

type SqlRunResult = {
  changes?: number | bigint;
  lastInsertRowid?: number | bigint;
};

type SqlStatement = {
  run: (...params: unknown[]) => SqlRunResult | Promise<SqlRunResult>;
  get: (
    ...params: unknown[]
  ) =>
    | (Record<string, unknown> | undefined)
    | Promise<Record<string, unknown> | undefined>;
  all: (
    ...params: unknown[]
  ) => Record<string, unknown>[] | Promise<Record<string, unknown>[]>;
  iterate: (
    ...params: unknown[]
  ) =>
    | Iterable<Record<string, unknown>>
    | AsyncIterable<Record<string, unknown>>;
  close?: () => void | Promise<void>;
  finalize?: () => void | Promise<void>;
};

type SqlDatabase = {
  prepare: (sql: string) => SqlStatement | Promise<SqlStatement>;
  exec?: (sql: string) => void | Promise<void>;
  close?: () => void | Promise<void>;
};

type StatementParams =
  | ReadonlyArray<unknown>
  | Record<string, unknown>
  | undefined;

async function openDatabase(file: string): Promise<SqlDatabase> {
  const maybeDatabaseFactory = (
    sqlite as unknown as {
      Database?: { open: (path: string) => Promise<SqlDatabase> };
    }
  ).Database;

  if (maybeDatabaseFactory?.open) {
    return maybeDatabaseFactory.open(file);
  }

  return new DatabaseSync(file) as unknown as SqlDatabase;
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function"
  );
}

function isIterable<T>(value: unknown): value is Iterable<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Iterable<T>)[Symbol.iterator] === "function"
  );
}

function toAsyncIterable<T>(
  source: Iterable<T> | AsyncIterable<T>
): AsyncIterable<T> {
  if (isAsyncIterable<T>(source)) {
    return source;
  }

  if (isIterable<T>(source)) {
    return {
      async *[Symbol.asyncIterator]() {
        for (const item of source) {
          yield item;
        }
      },
    };
  }

  throw new TypeError(
    "Statement iterator is neither iterable nor async iterable"
  );
}

function callWithParams<T>(
  fn: (...args: unknown[]) => T,
  params?: StatementParams
): T {
  if (Array.isArray(params)) {
    return fn(...params);
  }
  if (params && typeof params === "object") {
    return fn(params);
  }
  return fn();
}

async function finalizeStatement(statement: SqlStatement) {
  if (typeof statement.finalize === "function") {
    await statement.finalize();
    return;
  }
  if (typeof statement.close === "function") {
    await statement.close();
  }
}

async function withStatement<T>(
  db: SqlDatabase,
  sql: string,
  handler: (statement: SqlStatement) => Promise<T>
): Promise<T> {
  const prepared = db.prepare(sql);
  const statement = await Promise.resolve(prepared);
  try {
    return await handler(statement as SqlStatement);
  } finally {
    await finalizeStatement(statement as SqlStatement);
  }
}

async function execSql(db: SqlDatabase, sql: string): Promise<void> {
  if (typeof db.exec === "function") {
    await Promise.resolve(db.exec(sql));
    return;
  }

  await withStatement(db, sql, async (statement) => {
    await Promise.resolve(statement.run());
  });
}

async function runSql(
  db: SqlDatabase,
  sql: string,
  params?: StatementParams
): Promise<SqlRunResult> {
  try {
    return await withStatement(db, sql, async (statement) => {
      const result = callWithParams(
        (...args: unknown[]) => statement.run(...args),
        params
      );
      return (await Promise.resolve(result)) as SqlRunResult;
    });
  } catch (error) {
    const details =
      params && typeof params !== "function"
        ? Array.isArray(params)
          ? params
          : [params]
        : [];
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error";
    throw new Error(
      `SQLite run failed for SQL: ${sql} with params: ${JSON.stringify(details)} - ${message}`
    );
  }
}

async function getRow<T extends Record<string, unknown> | undefined>(
  db: SqlDatabase,
  sql: string,
  params?: StatementParams
): Promise<T | undefined> {
  return withStatement(db, sql, async (statement) => {
    const row = callWithParams(
      (...args: unknown[]) => statement.get(...args),
      params
    );
    return (await Promise.resolve(row)) as T | undefined;
  });
}

async function getAllRows<T extends Record<string, unknown>>(
  db: SqlDatabase,
  sql: string,
  params?: StatementParams
): Promise<T[]> {
  return withStatement(db, sql, async (statement) => {
    const iterable = callWithParams(
      (...args: unknown[]) => statement.iterate(...args),
      params
    );
    const rows: T[] = [];
    for await (const row of toAsyncIterable(iterable)) {
      rows.push(row as T);
    }
    return rows;
  });
}

export interface SqliteNotebookStoreOptions {
  databaseFile?: string;
}

const userNanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 18);

export class SqliteNotebookStore implements NotebookStore {
  private db!: SqlDatabase;
  private readonly file: string;
  private readonly ready: Promise<void>;
  private readonly nanoid = customAlphabet(
    "1234567890abcdefghijklmnopqrstuvwxyz",
    12
  );

  constructor(options: SqliteNotebookStoreOptions = {}) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const apiRoot = path.resolve(here, "../../");
    this.file = path.resolve(
      apiRoot,
      "../../",
      (options.databaseFile as string) ?? ".data/nodebooks.sqlite"
    );
    this.ready = this.initialize();
  }

  async all(): Promise<Notebook[]> {
    await this.ready;
    const rows = await getAllRows<{ data?: string }>(
      this.db,
      "SELECT data FROM notebooks ORDER BY updated_at DESC, id ASC"
    );
    const notebooks: Notebook[] = [];
    for (const row of rows) {
      if (typeof row.data === "string") {
        notebooks.push(this.deserialize(row.data));
      }
    }
    return notebooks;
  }

  async get(id: string): Promise<Notebook | undefined> {
    await this.ready;
    const row = await getRow<{ data?: string } | undefined>(
      this.db,
      "SELECT data FROM notebooks WHERE id = ? LIMIT 1",
      [id]
    );
    if (!row?.data) {
      return undefined;
    }
    return this.deserialize(row.data);
  }

  async getByPublicSlug(slug: string): Promise<Notebook | undefined> {
    await this.ready;
    const normalized = normalizeSlug(slug);
    if (!normalized) {
      return undefined;
    }

    const row = await getRow<{ data?: string } | undefined>(
      this.db,
      "SELECT data FROM notebooks WHERE public_slug = ? LIMIT 1",
      [normalized]
    );
    if (!row?.data) {
      return undefined;
    }
    return this.deserialize(row.data);
  }

  async save(notebook: Notebook): Promise<Notebook> {
    await this.ready;
    const parsed = ensureNotebookRuntimeVersion(
      NotebookSchema.parse({
        ...notebook,
        updatedAt: new Date().toISOString(),
      })
    );

    const sanitized: Notebook = {
      ...parsed,
      publicSlug: (() => {
        const slug = parsed.publicSlug ?? null;
        if (!slug) {
          return null;
        }
        const normalized = normalizeSlug(slug);
        return normalized || null;
      })(),
      published: Boolean(parsed.published),
    };

    await runSql(
      this.db,
      `INSERT INTO notebooks (id, name, data, created_at, updated_at, published, public_slug)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         data = excluded.data,
         updated_at = excluded.updated_at,
         published = excluded.published,
         public_slug = excluded.public_slug`,
      [
        sanitized.id,
        sanitized.name,
        JSON.stringify(sanitized),
        sanitized.createdAt,
        sanitized.updatedAt,
        sanitized.published ? 1 : 0,
        sanitized.publicSlug ?? null,
      ]
    );
    return sanitized;
  }

  async remove(id: string): Promise<Notebook | undefined> {
    await this.ready;
    const existing = await this.get(id);
    if (!existing) {
      return undefined;
    }

    await runSql(this.db, "DELETE FROM attachments WHERE notebook_id = ?", [
      id,
    ]);

    await runSql(this.db, "DELETE FROM notebooks WHERE id = ?", [id]);
    return existing;
  }

  async listAttachments(notebookId: string): Promise<NotebookAttachment[]> {
    await this.ready;
    const rows = await getAllRows<{
      id: string;
      notebook_id: string;
      filename: string;
      mime_type: string;
      size: number;
      created_at: string;
      updated_at: string;
    }>(
      this.db,
      `SELECT id, notebook_id, filename, mime_type, size, created_at, updated_at
       FROM attachments
       WHERE notebook_id = ?
       ORDER BY created_at DESC, id ASC`,
      [notebookId]
    );
    const attachments: NotebookAttachment[] = [];
    for (const row of rows) {
      attachments.push({
        id: row.id,
        notebookId: row.notebook_id,
        filename: row.filename,
        mimeType: row.mime_type,
        size: row.size,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
    return attachments;
  }

  async getAttachment(
    notebookId: string,
    attachmentId: string
  ): Promise<NotebookAttachmentContent | undefined> {
    await this.ready;
    const row = await getRow<
      | {
          id: string;
          notebook_id: string;
          filename: string;
          mime_type: string;
          size: number;
          created_at: string;
          updated_at: string;
          content: Uint8Array;
        }
      | undefined
    >(
      this.db,
      `SELECT id, notebook_id, filename, mime_type, size, content, created_at, updated_at
       FROM attachments
       WHERE notebook_id = ? AND id = ?
       LIMIT 1`,
      [notebookId, attachmentId]
    );
    if (!row) {
      return undefined;
    }
    return {
      id: row.id,
      notebookId: row.notebook_id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: row.size,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
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
    const now = new Date().toISOString();
    const content = new Uint8Array(input.content);
    const size = content.byteLength;

    await runSql(
      this.db,
      `INSERT INTO attachments (
        id, notebook_id, filename, mime_type, size, content, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, notebookId, input.filename, input.mimeType, size, content, now, now]
    );

    return {
      id,
      notebookId,
      filename: input.filename,
      mimeType: input.mimeType,
      size,
      createdAt: now,
      updatedAt: now,
    };
  }

  async removeAttachment(
    notebookId: string,
    attachmentId: string
  ): Promise<boolean> {
    await this.ready;
    const result = await runSql(
      this.db,
      "DELETE FROM attachments WHERE notebook_id = ? AND id = ?",
      [notebookId, attachmentId]
    );
    const changes = Number(result.changes ?? 0);
    return changes > 0;
  }

  async ensureReady() {
    await this.ready;
  }

  getDatabase(): SqlDatabase {
    if (!this.db) {
      throw new Error("SqliteNotebookStore database is not initialized yet");
    }
    return this.db;
  }

  async flush() {
    await this.ready;
  }

  private async initialize() {
    if (this.file !== ":memory:") {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
    }

    this.db = await openDatabase(this.file);

    await execSql(this.db, "PRAGMA journal_mode = WAL");
    await execSql(this.db, "PRAGMA foreign_keys = ON");

    await execSql(
      this.db,
      `CREATE TABLE IF NOT EXISTS notebooks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published INTEGER NOT NULL DEFAULT 0,
        public_slug TEXT UNIQUE
      )`
    );

    await execSql(
      this.db,
      `CREATE INDEX IF NOT EXISTS idx_notebooks_updated_at
        ON notebooks (updated_at DESC)`
    );

    try {
      await execSql(
        this.db,
        `ALTER TABLE notebooks ADD COLUMN published INTEGER NOT NULL DEFAULT 0`
      );
    } catch (error) {
      void error;
    }

    try {
      await execSql(
        this.db,
        `ALTER TABLE notebooks ADD COLUMN public_slug TEXT`
      );
    } catch (error) {
      void error;
    }

    await execSql(
      this.db,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_notebooks_public_slug
        ON notebooks (public_slug)`
    );

    await execSql(
      this.db,
      `CREATE TABLE IF NOT EXISTS attachments (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        content BLOB NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
      )`
    );

    await execSql(
      this.db,
      `CREATE INDEX IF NOT EXISTS idx_attachments_notebook
        ON attachments (notebook_id, created_at DESC, id ASC)`
    );

    await execSql(
      this.db,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    );

    await execSql(
      this.db,
      `CREATE INDEX IF NOT EXISTS idx_settings_updated_at
        ON settings (updated_at DESC, key ASC)`
    );

    await execSql(
      this.db,
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    );

    await execSql(
      this.db,
      `CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE,
        published INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    );

    try {
      await execSql(this.db, `ALTER TABLE projects ADD COLUMN slug TEXT`);
    } catch (error) {
      void error;
    }

    try {
      await execSql(
        this.db,
        `ALTER TABLE projects ADD COLUMN published INTEGER NOT NULL DEFAULT 0`
      );
    } catch (error) {
      void error;
    }

    await execSql(
      this.db,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug
        ON projects (slug)`
    );

    await execSql(
      this.db,
      `CREATE INDEX IF NOT EXISTS idx_projects_created_at
        ON projects (created_at ASC, id ASC)`
    );

    await execSql(
      this.db,
      `CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    );

    await execSql(
      this.db,
      `CREATE INDEX IF NOT EXISTS idx_user_sessions_user
        ON user_sessions (user_id, updated_at DESC)`
    );

    await execSql(
      this.db,
      `CREATE TABLE IF NOT EXISTS user_invitations (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        notebook_id TEXT,
        role TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        invited_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        accepted_at TEXT,
        revoked_at TEXT,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE
      )`
    );

    await execSql(
      this.db,
      `CREATE INDEX IF NOT EXISTS idx_user_invitations_email
        ON user_invitations (email, created_at DESC, id ASC)`
    );

    try {
      await execSql(
        this.db,
        `ALTER TABLE user_invitations ADD COLUMN notebook_id TEXT`
      );
    } catch (error) {
      void error;
    }

    await execSql(
      this.db,
      `CREATE INDEX IF NOT EXISTS idx_user_invitations_notebook
        ON user_invitations (notebook_id, created_at DESC, id ASC)`
    );

    await execSql(
      this.db,
      `CREATE TABLE IF NOT EXISTS notebook_collaborators (
        id TEXT PRIMARY KEY,
        notebook_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (notebook_id, user_id),
        FOREIGN KEY (notebook_id) REFERENCES notebooks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    );

    await execSql(
      this.db,
      `CREATE INDEX IF NOT EXISTS idx_notebook_collaborators_user
        ON notebook_collaborators (user_id, notebook_id)`
    );

    await execSql(
      this.db,
      `CREATE TABLE IF NOT EXISTS project_collaborators (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (project_id, user_id),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`
    );

    await execSql(
      this.db,
      `CREATE INDEX IF NOT EXISTS idx_project_collaborators_user
        ON project_collaborators (user_id, project_id)`
    );

    await execSql(
      this.db,
      `CREATE TABLE IF NOT EXISTS project_invitations (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        project_id TEXT NOT NULL,
        role TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        invited_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        accepted_at TEXT,
        revoked_at TEXT,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`
    );

    await execSql(
      this.db,
      `CREATE INDEX IF NOT EXISTS idx_project_invitations_email
        ON project_invitations (email, created_at DESC, id ASC)`
    );

    await execSql(
      this.db,
      `CREATE INDEX IF NOT EXISTS idx_project_invitations_project
        ON project_invitations (project_id, created_at DESC, id ASC)`
    );
  }

  private deserialize(raw: string): Notebook {
    const data = JSON.parse(raw);
    return ensureNotebookRuntimeVersion(NotebookSchema.parse(data));
  }
}

export class SqliteSettingsStore implements SettingsStore {
  constructor(private readonly notebooks: SqliteNotebookStore) {}

  private async getDb(): Promise<SqlDatabase> {
    await this.notebooks.ensureReady();
    return this.notebooks.getDatabase();
  }

  async all(): Promise<Record<string, unknown>> {
    const db = await this.getDb();
    const result: Record<string, unknown> = {};
    const rows = await getAllRows<{ key?: string; value?: string }>(
      db,
      "SELECT key, value FROM settings"
    );
    for (const row of rows) {
      if (!row.key) {
        continue;
      }
      result[row.key] = row.value ? JSON.parse(row.value) : null;
    }
    return result;
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const db = await this.getDb();
    const row = await getRow<{ value?: string } | undefined>(
      db,
      "SELECT value FROM settings WHERE key = ? LIMIT 1",
      [key]
    );
    if (row?.value == null) {
      return undefined;
    }
    return JSON.parse(row.value) as T;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    if (value === undefined) {
      await this.delete(key);
      return;
    }
    const db = await this.getDb();
    const payload = JSON.stringify(value ?? null);
    const updatedAt = new Date().toISOString();
    await runSql(
      db,
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
      [key, payload, updatedAt]
    );
    await this.notebooks.flush();
  }

  async delete(key: string): Promise<void> {
    const db = await this.getDb();
    await runSql(db, "DELETE FROM settings WHERE key = ?", [key]);
    await this.notebooks.flush();
  }
}

const mapUserRow = (row: {
  id: string;
  email: string;
  name: string | null;
  role: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}): User => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role as User["role"],
  passwordHash: row.password_hash,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapInvitationRow = (row: {
  id: string;
  email: string;
  notebook_id: string | null;
  role: string;
  token_hash: string;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}): Invitation => ({
  id: row.id,
  email: row.email,
  notebookId: row.notebook_id ?? "",
  role: row.role as Invitation["role"],
  tokenHash: row.token_hash,
  invitedBy: row.invited_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
  acceptedAt: row.accepted_at,
  revokedAt: row.revoked_at,
});

const mapCollaboratorRow = (row: {
  id: string;
  notebook_id: string;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
}): NotebookCollaborator => ({
  id: row.id,
  notebookId: row.notebook_id,
  userId: row.user_id,
  role: row.role as NotebookRole,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapProjectRow = (row: {
  id: string;
  name: string;
  slug: string | null;
  published: number | null;
  created_at: string;
  updated_at: string;
}): Project => ({
  id: row.id,
  name: row.name,
  slug:
    row.slug && row.slug.trim().length > 0
      ? normalizeSlug(row.slug)
      : normalizeSlug(row.name) || normalizeSlug(row.id) || row.id,
  published: Boolean(row.published),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapProjectCollaboratorRow = (row: {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
}): ProjectCollaborator => ({
  id: row.id,
  projectId: row.project_id,
  userId: row.user_id,
  role: row.role as ProjectRole,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapProjectInvitationRow = (row: {
  id: string;
  email: string;
  project_id: string;
  role: string;
  token_hash: string;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}): ProjectInvitation => ({
  id: row.id,
  email: row.email,
  projectId: row.project_id,
  role: row.role as ProjectRole,
  tokenHash: row.token_hash,
  invitedBy: row.invited_by,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
  acceptedAt: row.accepted_at,
  revokedAt: row.revoked_at,
});

export class SqliteUserStore implements UserStore {
  constructor(private readonly notebooks: SqliteNotebookStore) {}

  private async getDb(): Promise<SqlDatabase> {
    await this.notebooks.ensureReady();
    return this.notebooks.getDatabase();
  }

  async create(input: CreateUserInput): Promise<User> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const id = userNanoid();
    const email = input.email.trim().toLowerCase();
    await runSql(
      db,
      `INSERT INTO users (id, email, name, role, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
    await this.notebooks.flush();
    const created = await this.get(id);
    if (!created) {
      throw new Error("Failed to create user");
    }
    return created;
  }

  async get(id: string): Promise<User | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          email: string;
          name: string | null;
          role: string;
          password_hash: string;
          created_at: string;
          updated_at: string;
        }
      | undefined
    >(
      db,
      `SELECT id, email, name, role, password_hash, created_at, updated_at FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    return row ? mapUserRow(row) : undefined;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          email: string;
          name: string | null;
          role: string;
          password_hash: string;
          created_at: string;
          updated_at: string;
        }
      | undefined
    >(
      db,
      `SELECT id, email, name, role, password_hash, created_at, updated_at FROM users WHERE email = ? LIMIT 1`,
      [email.trim().toLowerCase()]
    );
    return row ? mapUserRow(row) : undefined;
  }

  async update(id: string, updates: UpdateUserInput): Promise<User> {
    const db = await this.getDb();
    const setFragments: string[] = [];
    const values: (string | null)[] = [];

    if (updates.name !== undefined) {
      setFragments.push("name = ?");
      values.push(updates.name?.trim() ?? null);
    }
    if (typeof updates.passwordHash === "string") {
      setFragments.push("password_hash = ?");
      values.push(updates.passwordHash);
    }
    if (updates.role) {
      setFragments.push("role = ?");
      values.push(updates.role);
    }

    if (setFragments.length === 0) {
      const current = await this.get(id);
      if (!current) {
        throw new Error("User not found");
      }
      return current;
    }

    setFragments.push("updated_at = ?");
    const now = new Date().toISOString();
    values.push(now);
    values.push(id);

    const result = await runSql(
      db,
      `UPDATE users SET ${setFragments.join(", ")} WHERE id = ?`,
      values
    );

    if (Number(result.changes ?? 0) === 0) {
      throw new Error("User not found");
    }

    await this.notebooks.flush();
    const updated = await this.get(id);
    if (!updated) {
      throw new Error("User not found");
    }
    return updated;
  }

  async list(): Promise<User[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{
      id: string;
      email: string;
      name: string | null;
      role: string;
      password_hash: string;
      created_at: string;
      updated_at: string;
    }>(
      db,
      `SELECT id, email, name, role, password_hash, created_at, updated_at FROM users ORDER BY created_at ASC`
    );
    return rows.map(mapUserRow);
  }

  async remove(id: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await runSql(db, `DELETE FROM users WHERE id = ?`, [id]);
    const removed = Number(result.changes ?? 0) > 0;
    if (removed) {
      await this.notebooks.flush();
    }
    return removed;
  }

  async count(): Promise<number> {
    const db = await this.getDb();
    const row = await getRow<{ count: number } | undefined>(
      db,
      `SELECT COUNT(1) as count FROM users`
    );
    return Number(row?.count ?? 0);
  }
}

const mapSessionRow = (row: {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  revoked_at: string | null;
}): AuthSession => ({
  id: row.id,
  userId: row.user_id,
  tokenHash: row.token_hash,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at ?? null,
});

export class SqliteAuthSessionStore implements AuthSessionStore {
  constructor(private readonly notebooks: SqliteNotebookStore) {}

  private async getDb(): Promise<SqlDatabase> {
    await this.notebooks.ensureReady();
    return this.notebooks.getDatabase();
  }

  async create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<AuthSession> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const id = userNanoid();
    await runSql(
      db,
      `INSERT INTO user_sessions (id, user_id, token_hash, created_at, updated_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [id, input.userId, input.tokenHash, now, now, input.expiresAt]
    );
    await this.notebooks.flush();
    const created = await this.findByTokenHash(input.tokenHash);
    if (!created) {
      throw new Error("Failed to create session");
    }
    return created;
  }

  async findByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          user_id: string;
          token_hash: string;
          created_at: string;
          updated_at: string;
          expires_at: string;
          revoked_at: string | null;
        }
      | undefined
    >(
      db,
      `SELECT id, user_id, token_hash, created_at, updated_at, expires_at, revoked_at FROM user_sessions WHERE token_hash = ? LIMIT 1`,
      [tokenHash]
    );
    return row ? mapSessionRow(row) : undefined;
  }

  async touch(id: string): Promise<void> {
    const db = await this.getDb();
    await runSql(db, `UPDATE user_sessions SET updated_at = ? WHERE id = ?`, [
      new Date().toISOString(),
      id,
    ]);
    await this.notebooks.flush();
  }

  async revoke(id: string): Promise<void> {
    const db = await this.getDb();
    await runSql(db, `UPDATE user_sessions SET revoked_at = ? WHERE id = ?`, [
      new Date().toISOString(),
      id,
    ]);
    await this.notebooks.flush();
  }

  async revokeForUser(userId: string): Promise<void> {
    const db = await this.getDb();
    await runSql(
      db,
      `UPDATE user_sessions SET revoked_at = ? WHERE user_id = ?`,
      [new Date().toISOString(), userId]
    );
    await this.notebooks.flush();
  }
}

export class SqliteInvitationStore implements InvitationStore {
  constructor(private readonly notebooks: SqliteNotebookStore) {}

  private async getDb(): Promise<SqlDatabase> {
    await this.notebooks.ensureReady();
    return this.notebooks.getDatabase();
  }

  async create(input: CreateInvitationInput): Promise<Invitation> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const id = userNanoid();
    const email = input.email.trim().toLowerCase();
    await runSql(
      db,
      `INSERT INTO user_invitations (
         id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [
        id,
        email,
        input.notebookId,
        input.role,
        input.tokenHash,
        input.invitedBy ?? null,
        now,
        now,
        input.expiresAt,
      ]
    );
    await this.notebooks.flush();
    const created = await this.get(id);
    if (!created) {
      throw new Error("Failed to create invitation");
    }
    return created;
  }

  async get(id: string): Promise<Invitation | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          email: string;
          notebook_id: string | null;
          role: string;
          token_hash: string;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
        }
      | undefined
    >(
      db,
      `SELECT id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return row ? mapInvitationRow(row) : undefined;
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          email: string;
          notebook_id: string | null;
          role: string;
          token_hash: string;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
        }
      | undefined
    >(
      db,
      `SELECT id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE token_hash = ?
       LIMIT 1`,
      [tokenHash]
    );
    return row ? mapInvitationRow(row) : undefined;
  }

  async findActiveByEmail(
    email: string,
    notebookId: string
  ): Promise<Invitation | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          email: string;
          notebook_id: string | null;
          role: string;
          token_hash: string;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
        }
      | undefined
    >(
      db,
      `SELECT id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE email = ? AND notebook_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [email.trim().toLowerCase(), notebookId]
    );
    if (!row) {
      return undefined;
    }
    const invitation = mapInvitationRow(row);
    if (invitation.acceptedAt || invitation.revokedAt) {
      return undefined;
    }
    return invitation;
  }

  async list(): Promise<Invitation[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{
      id: string;
      email: string;
      notebook_id: string | null;
      role: string;
      token_hash: string;
      invited_by: string | null;
      created_at: string;
      updated_at: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    }>(
      db,
      `SELECT id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       ORDER BY created_at DESC, id DESC`
    );
    return rows.map(mapInvitationRow);
  }

  async listByNotebook(notebookId: string): Promise<Invitation[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{
      id: string;
      email: string;
      notebook_id: string | null;
      role: string;
      token_hash: string;
      invited_by: string | null;
      created_at: string;
      updated_at: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    }>(
      db,
      `SELECT id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE notebook_id = ?
       ORDER BY created_at DESC, id DESC`,
      [notebookId]
    );
    return rows.map(mapInvitationRow);
  }

  async markAccepted(id: string): Promise<Invitation | undefined> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    await runSql(
      db,
      `UPDATE user_invitations
       SET accepted_at = ?, updated_at = ?
       WHERE id = ?`,
      [now, now, id]
    );
    await this.notebooks.flush();
    return this.get(id);
  }

  async revoke(id: string): Promise<Invitation | undefined> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    await runSql(
      db,
      `UPDATE user_invitations
       SET revoked_at = ?, updated_at = ?
       WHERE id = ?`,
      [now, now, id]
    );
    await this.notebooks.flush();
    return this.get(id);
  }

  async remove(id: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await runSql(
      db,
      `DELETE FROM user_invitations WHERE id = ?`,
      [id]
    );
    const removed = Number(result.changes ?? 0) > 0;
    if (removed) {
      await this.notebooks.flush();
    }
    return removed;
  }

  async listPending(): Promise<Invitation[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{
      id: string;
      email: string;
      notebook_id: string | null;
      role: string;
      token_hash: string;
      invited_by: string | null;
      created_at: string;
      updated_at: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    }>(
      db,
      `SELECT id, email, notebook_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?
       ORDER BY created_at DESC, id DESC`,
      [new Date().toISOString()]
    );
    return rows.map(mapInvitationRow);
  }
}
export class SqliteNotebookCollaboratorStore implements NotebookCollaboratorStore {
  constructor(private readonly notebooks: SqliteNotebookStore) {}

  private async getDb(): Promise<SqlDatabase> {
    await this.notebooks.ensureReady();
    return this.notebooks.getDatabase();
  }

  async listByNotebook(notebookId: string): Promise<NotebookCollaborator[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{
      id: string;
      notebook_id: string;
      user_id: string;
      role: string;
      created_at: string;
      updated_at: string;
    }>(
      db,
      `SELECT id, notebook_id, user_id, role, created_at, updated_at
       FROM notebook_collaborators
       WHERE notebook_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
      [notebookId]
    );
    return rows.map(mapCollaboratorRow);
  }

  async listNotebookIdsForUser(userId: string): Promise<string[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{ notebook_id: string }>(
      db,
      `SELECT notebook_id
       FROM notebook_collaborators
       WHERE user_id = ?
       ORDER BY notebook_id ASC`,
      [userId]
    );
    return rows.map((row) => row.notebook_id);
  }

  async listForUser(userId: string): Promise<NotebookCollaborator[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{
      id: string;
      notebook_id: string;
      user_id: string;
      role: string;
      created_at: string;
      updated_at: string;
    }>(
      db,
      `SELECT id, notebook_id, user_id, role, created_at, updated_at
       FROM notebook_collaborators
       WHERE user_id = ?
       ORDER BY notebook_id ASC`,
      [userId]
    );
    return rows.map(mapCollaboratorRow);
  }

  async get(
    notebookId: string,
    userId: string
  ): Promise<NotebookCollaborator | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          notebook_id: string;
          user_id: string;
          role: string;
          created_at: string;
          updated_at: string;
        }
      | undefined
    >(
      db,
      `SELECT id, notebook_id, user_id, role, created_at, updated_at
       FROM notebook_collaborators
       WHERE notebook_id = ? AND user_id = ?
       LIMIT 1`,
      [notebookId, userId]
    );
    return row ? mapCollaboratorRow(row) : undefined;
  }

  async upsert(input: {
    notebookId: string;
    userId: string;
    role: NotebookRole;
  }): Promise<NotebookCollaborator> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const id = userNanoid();
    await runSql(
      db,
      `INSERT INTO notebook_collaborators (
         id, notebook_id, user_id, role, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(notebook_id, user_id) DO UPDATE SET
         role = excluded.role,
         updated_at = excluded.updated_at`,
      [id, input.notebookId, input.userId, input.role, now, now]
    );
    await this.notebooks.flush();
    const collaborator = await this.get(input.notebookId, input.userId);
    if (!collaborator) {
      throw new Error("Failed to upsert notebook collaborator");
    }
    return collaborator;
  }

  async updateRole(
    notebookId: string,
    userId: string,
    role: NotebookRole
  ): Promise<NotebookCollaborator | undefined> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    await runSql(
      db,
      `UPDATE notebook_collaborators
       SET role = ?, updated_at = ?
       WHERE notebook_id = ? AND user_id = ?`,
      [role, now, notebookId, userId]
    );
    await this.notebooks.flush();
    return this.get(notebookId, userId);
  }

  async remove(notebookId: string, userId: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await runSql(
      db,
      `DELETE FROM notebook_collaborators
       WHERE notebook_id = ? AND user_id = ?`,
      [notebookId, userId]
    );
    const affected = Number(result.changes ?? 0);
    await this.notebooks.flush();
    return affected > 0;
  }
}
export class SqliteProjectStore implements ProjectStore {
  constructor(private readonly notebooks: SqliteNotebookStore) {}

  private projectMigrations: Promise<void> | null = null;

  private async getDb(): Promise<SqlDatabase> {
    await this.notebooks.ensureReady();
    const db = this.notebooks.getDatabase();
    if (!this.projectMigrations) {
      this.projectMigrations = this.ensureProjectMigrations(db);
    }
    await this.projectMigrations;
    return db;
  }

  private async ensureProjectMigrations(db: SqlDatabase): Promise<void> {
    await execSql(
      db,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug
        ON projects (slug)`
    );

    const missing = await getAllRows<{ id: string; name: string }>(
      db,
      `SELECT id, name FROM projects WHERE slug IS NULL OR trim(slug) = ''`
    );

    let updated = false;

    for (const row of missing) {
      const slug = await this.generateUniqueProjectSlug(db, row.name, row.id);
      await runSql(db, `UPDATE projects SET slug = ? WHERE id = ?`, [
        slug,
        row.id,
      ]);
      updated = true;
    }

    const sanitize = await getAllRows<{
      id: string;
      name: string;
      slug: string;
    }>(db, `SELECT id, name, slug FROM projects WHERE slug IS NOT NULL`);

    for (const row of sanitize) {
      const desired = await this.generateUniqueProjectSlug(
        db,
        row.name,
        row.id,
        row.slug,
        row.id
      );
      if (desired !== row.slug) {
        await runSql(db, `UPDATE projects SET slug = ? WHERE id = ?`, [
          desired,
          row.id,
        ]);
        updated = true;
      }
    }

    if (updated) {
      await this.notebooks.flush();
    }
  }

  private async projectSlugExists(
    db: SqlDatabase,
    slug: string,
    excludeId?: string
  ): Promise<boolean> {
    const row = await getRow<Record<string, unknown> | undefined>(
      db,
      excludeId
        ? `SELECT 1 FROM projects WHERE slug = ? AND id != ? LIMIT 1`
        : `SELECT 1 FROM projects WHERE slug = ? LIMIT 1`,
      excludeId ? [slug, excludeId] : [slug]
    );
    return Boolean(row);
  }

  private async generateUniqueProjectSlug(
    db: SqlDatabase,
    name: string,
    fallbackId: string,
    requested?: string | null,
    excludeId?: string
  ): Promise<string> {
    const fallbackSlug =
      normalizeSlug(fallbackId) ||
      normalizeSlug(`project-${fallbackId}`) ||
      fallbackId.toLowerCase();

    let base =
      (typeof requested === "string" && requested.trim().length > 0
        ? normalizeSlug(requested)
        : null) ||
      suggestSlug(name, fallbackSlug) ||
      fallbackSlug;

    if (!base) {
      base = this.randomProjectSlug();
    }

    let candidate = base;
    let suffix = 2;

    while (
      candidate &&
      (await this.projectSlugExists(db, candidate, excludeId))
    ) {
      const next = normalizeSlug(`${base}-${suffix++}`);
      if (next) {
        candidate = next;
        continue;
      }

      const randomId = userNanoid().slice(0, 6);
      const random = normalizeSlug(`${fallbackSlug}-${randomId}`);
      if (random && !(await this.projectSlugExists(db, random, excludeId))) {
        candidate = random;
        break;
      }

      candidate = this.randomProjectSlug();
    }

    if (!candidate) {
      candidate = this.randomProjectSlug();
    }

    if (await this.projectSlugExists(db, candidate, excludeId)) {
      let attempt = 0;
      while (attempt < 5) {
        const random = this.randomProjectSlug();
        if (!(await this.projectSlugExists(db, random, excludeId))) {
          candidate = random;
          break;
        }
        attempt += 1;
      }
      if (attempt >= 5) {
        candidate = `${fallbackSlug}-${Date.now()}`.slice(0, 120);
        candidate = normalizeSlug(candidate) || candidate.toLowerCase();
      }
    }

    return candidate;
  }
  private randomProjectSlug(): string {
    const randomId = userNanoid();
    const slug = normalizeSlug(`project-${randomId}`);
    return slug || `project-${randomId}`.toLowerCase();
  }

  async list(): Promise<Project[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{
      id: string;
      name: string;
      slug: string | null;
      published: number | null;
      created_at: string;
      updated_at: string;
    }>(
      db,
      `SELECT id, name, slug, published, created_at, updated_at FROM projects ORDER BY created_at ASC, id ASC`
    );
    return rows.map(mapProjectRow);
  }

  async get(id: string): Promise<Project | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          name: string;
          slug: string | null;
          published: number | null;
          created_at: string;
          updated_at: string;
        }
      | undefined
    >(
      db,
      `SELECT id, name, slug, published, created_at, updated_at FROM projects WHERE id = ? LIMIT 1`,
      [id]
    );
    return row ? mapProjectRow(row) : undefined;
  }

  async getBySlug(slug: string): Promise<Project | undefined> {
    const db = await this.getDb();
    const normalized = normalizeSlug(slug);
    if (!normalized) {
      return undefined;
    }
    const row = await getRow<
      | {
          id: string;
          name: string;
          slug: string | null;
          published: number | null;
          created_at: string;
          updated_at: string;
        }
      | undefined
    >(
      db,
      `SELECT id, name, slug, published, created_at, updated_at FROM projects WHERE slug = ? LIMIT 1`,
      [normalized]
    );
    return row ? mapProjectRow(row) : undefined;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const id = userNanoid();
    const name = input.name.trim();
    const slug = await this.generateUniqueProjectSlug(
      db,
      name,
      id,
      input.slug ?? null
    );
    const published = Boolean(input.published);
    await runSql(
      db,
      `INSERT INTO projects (id, name, slug, published, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, slug, published ? 1 : 0, now, now]
    );
    await this.notebooks.flush();
    const created = await this.get(id);
    if (!created) {
      throw new Error("Failed to create project");
    }
    return created;
  }

  async update(id: string, updates: UpdateProjectInput): Promise<Project> {
    const db = await this.getDb();
    const current = await this.get(id);
    if (!current) {
      throw new Error("Project not found");
    }

    let effectiveName = current.name;
    const fragments: string[] = [];
    const values: (string | number | null)[] = [];

    if (typeof updates.name === "string") {
      effectiveName = updates.name.trim();
      fragments.push("name = ?");
      values.push(effectiveName);
    }

    if (updates.slug !== undefined) {
      const preferred = updates.slug ?? null;
      const slug = await this.generateUniqueProjectSlug(
        db,
        effectiveName,
        id,
        preferred,
        id
      );
      fragments.push("slug = ?");
      values.push(slug);
    }

    if (typeof updates.published === "boolean") {
      fragments.push("published = ?");
      values.push(updates.published ? 1 : 0);
    }

    if (fragments.length === 0) {
      return current;
    }

    const now = new Date().toISOString();
    fragments.push("updated_at = ?");
    values.push(now);
    values.push(id);

    const result = await runSql(
      db,
      `UPDATE projects SET ${fragments.join(", ")} WHERE id = ?`,
      values
    );

    if (Number(result.changes ?? 0) === 0) {
      throw new Error("Project not found");
    }

    await this.notebooks.flush();
    const updated = await this.get(id);
    if (!updated) {
      throw new Error("Project not found");
    }
    return updated;
  }

  async remove(id: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await runSql(db, "DELETE FROM projects WHERE id = ?", [id]);
    const removed = Number(result.changes ?? 0) > 0;
    if (removed) {
      await this.notebooks.flush();
    }
    return removed;
  }
}

export class SqliteProjectCollaboratorStore implements ProjectCollaboratorStore {
  constructor(private readonly notebooks: SqliteNotebookStore) {}

  private async getDb(): Promise<SqlDatabase> {
    await this.notebooks.ensureReady();
    return this.notebooks.getDatabase();
  }

  async listByProject(projectId: string): Promise<ProjectCollaborator[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{
      id: string;
      project_id: string;
      user_id: string;
      role: string;
      created_at: string;
      updated_at: string;
    }>(
      db,
      `SELECT id, project_id, user_id, role, created_at, updated_at
       FROM project_collaborators
       WHERE project_id = ?
       ORDER BY updated_at DESC, created_at DESC`,
      [projectId]
    );
    return rows.map(mapProjectCollaboratorRow);
  }

  async listProjectIdsForUser(userId: string): Promise<string[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{ project_id: string }>(
      db,
      `SELECT project_id
       FROM project_collaborators
       WHERE user_id = ?
       ORDER BY project_id ASC`,
      [userId]
    );
    return rows.map((row) => row.project_id);
  }

  async get(
    projectId: string,
    userId: string
  ): Promise<ProjectCollaborator | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          project_id: string;
          user_id: string;
          role: string;
          created_at: string;
          updated_at: string;
        }
      | undefined
    >(
      db,
      `SELECT id, project_id, user_id, role, created_at, updated_at
       FROM project_collaborators
       WHERE project_id = ? AND user_id = ?
       LIMIT 1`,
      [projectId, userId]
    );
    return row ? mapProjectCollaboratorRow(row) : undefined;
  }

  async upsert(input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
  }): Promise<ProjectCollaborator> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const id = userNanoid();
    await runSql(
      db,
      `INSERT INTO project_collaborators (
         id, project_id, user_id, role, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, user_id) DO UPDATE SET
         role = excluded.role,
         updated_at = excluded.updated_at`,
      [id, input.projectId, input.userId, input.role, now, now]
    );
    await this.notebooks.flush();
    const collaborator = await this.get(input.projectId, input.userId);
    if (!collaborator) {
      throw new Error("Failed to upsert project collaborator");
    }
    return collaborator;
  }

  async updateRole(
    projectId: string,
    userId: string,
    role: ProjectRole
  ): Promise<ProjectCollaborator | undefined> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const result = await runSql(
      db,
      `UPDATE project_collaborators
       SET role = ?, updated_at = ?
       WHERE project_id = ? AND user_id = ?`,
      [role, now, projectId, userId]
    );
    if (Number(result.changes ?? 0) === 0) {
      return undefined;
    }
    await this.notebooks.flush();
    return this.get(projectId, userId);
  }

  async remove(projectId: string, userId: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await runSql(
      db,
      `DELETE FROM project_collaborators
       WHERE project_id = ? AND user_id = ?`,
      [projectId, userId]
    );
    const removed = Number(result.changes ?? 0) > 0;
    if (removed) {
      await this.notebooks.flush();
    }
    return removed;
  }

  async removeAllForProject(projectId: string): Promise<void> {
    const db = await this.getDb();
    await runSql(db, `DELETE FROM project_collaborators WHERE project_id = ?`, [
      projectId,
    ]);
    await this.notebooks.flush();
  }
}
export class SqliteProjectInvitationStore implements ProjectInvitationStore {
  constructor(private readonly notebooks: SqliteNotebookStore) {}

  private async getDb(): Promise<SqlDatabase> {
    await this.notebooks.ensureReady();
    return this.notebooks.getDatabase();
  }

  async create(
    input: CreateProjectInvitationInput
  ): Promise<ProjectInvitation> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const id = userNanoid();
    const email = input.email.trim().toLowerCase();
    const tokenHash = input.tokenHash;
    await runSql(
      db,
      `INSERT INTO project_invitations (
         id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [
        id,
        email,
        input.projectId,
        input.role,
        tokenHash,
        input.invitedBy ?? null,
        now,
        now,
        input.expiresAt,
      ]
    );
    await this.notebooks.flush();
    const created = await this.get(id);
    if (!created) {
      throw new Error("Failed to create project invitation");
    }
    return created;
  }

  async get(id: string): Promise<ProjectInvitation | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          email: string;
          project_id: string;
          role: string;
          token_hash: string;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
        }
      | undefined
    >(
      db,
      `SELECT id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM project_invitations
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return row ? mapProjectInvitationRow(row) : undefined;
  }

  async findByTokenHash(
    tokenHash: string
  ): Promise<ProjectInvitation | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          email: string;
          project_id: string;
          role: string;
          token_hash: string;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
        }
      | undefined
    >(
      db,
      `SELECT id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM project_invitations
       WHERE token_hash = ?
       LIMIT 1`,
      [tokenHash]
    );
    return row ? mapProjectInvitationRow(row) : undefined;
  }

  async findActiveByEmail(
    email: string,
    projectId: string
  ): Promise<ProjectInvitation | undefined> {
    const db = await this.getDb();
    const row = await getRow<
      | {
          id: string;
          email: string;
          project_id: string;
          role: string;
          token_hash: string;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
        }
      | undefined
    >(
      db,
      `SELECT id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM project_invitations
       WHERE email = ? AND project_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [email.trim().toLowerCase(), projectId]
    );
    if (!row) {
      return undefined;
    }
    const invitation = mapProjectInvitationRow(row);
    if (invitation.acceptedAt || invitation.revokedAt) {
      return undefined;
    }
    return invitation;
  }

  async list(): Promise<ProjectInvitation[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{
      id: string;
      email: string;
      project_id: string;
      role: string;
      token_hash: string;
      invited_by: string | null;
      created_at: string;
      updated_at: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    }>(
      db,
      `SELECT id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM project_invitations
       ORDER BY created_at DESC, id DESC`
    );
    return rows.map(mapProjectInvitationRow);
  }

  async listByProject(projectId: string): Promise<ProjectInvitation[]> {
    const db = await this.getDb();
    const rows = await getAllRows<{
      id: string;
      email: string;
      project_id: string;
      role: string;
      token_hash: string;
      invited_by: string | null;
      created_at: string;
      updated_at: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
    }>(
      db,
      `SELECT id, email, project_id, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM project_invitations
       WHERE project_id = ?
       ORDER BY created_at DESC, id DESC`,
      [projectId]
    );
    return rows.map(mapProjectInvitationRow);
  }

  async markAccepted(id: string): Promise<ProjectInvitation | undefined> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    await runSql(
      db,
      `UPDATE project_invitations
       SET accepted_at = ?, updated_at = ?
       WHERE id = ?`,
      [now, id]
    );
    await this.notebooks.flush();
    return this.get(id);
  }

  async revoke(id: string): Promise<ProjectInvitation | undefined> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    await runSql(
      db,
      `UPDATE project_invitations
       SET revoked_at = ?, updated_at = ?
       WHERE id = ?`,
      [now, id]
    );
    await this.notebooks.flush();
    return this.get(id);
  }

  async remove(id: string): Promise<boolean> {
    const db = await this.getDb();
    const result = await runSql(
      db,
      `DELETE FROM project_invitations WHERE id = ?`,
      [id]
    );
    const removed = Number(result.changes ?? 0) > 0;
    if (removed) {
      await this.notebooks.flush();
    }
    return removed;
  }
}
