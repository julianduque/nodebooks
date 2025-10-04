import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs, {
  type Database as SqlDatabase,
  type SqlJsStatic,
} from "sql.js";
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
} from "../types.js";

export interface SqliteNotebookStoreOptions {
  databaseFile?: string;
}

const userNanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 18);

export class SqliteNotebookStore implements NotebookStore {
  private db!: SqlDatabase;
  private readonly file: string;
  private readonly ready: Promise<void>;
  private sqlModule!: SqlJsStatic;
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
    const statement = this.db.prepare(
      "SELECT data FROM notebooks ORDER BY updated_at DESC, id ASC"
    );

    const notebooks: Notebook[] = [];
    while (statement.step()) {
      const row = statement.getAsObject() as { data?: string };
      if (row.data) {
        notebooks.push(this.deserialize(row.data));
      }
    }
    statement.free();

    return notebooks;
  }

  async get(id: string): Promise<Notebook | undefined> {
    await this.ready;
    const statement = this.db.prepare(
      "SELECT data FROM notebooks WHERE id = ?1 LIMIT 1"
    );
    statement.bind([id]);

    let notebook: Notebook | undefined;
    if (statement.step()) {
      const row = statement.getAsObject() as { data?: string };
      if (row.data) {
        notebook = this.deserialize(row.data);
      }
    }
    statement.free();

    return notebook;
  }

  async save(notebook: Notebook): Promise<Notebook> {
    await this.ready;
    const parsed = ensureNotebookRuntimeVersion(
      NotebookSchema.parse({
        ...notebook,
        updatedAt: new Date().toISOString(),
      })
    );

    const statement = this.db.prepare(
      `INSERT INTO notebooks (id, name, data, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         data = excluded.data,
         updated_at = excluded.updated_at`
    );

    statement.run([
      parsed.id,
      parsed.name,
      JSON.stringify(parsed),
      parsed.createdAt,
      parsed.updatedAt,
    ]);
    statement.free();

    await this.persistToDisk();
    return parsed;
  }

  async remove(id: string): Promise<Notebook | undefined> {
    await this.ready;
    const existing = await this.get(id);
    if (!existing) {
      return undefined;
    }

    const attachmentsStatement = this.db.prepare(
      "DELETE FROM attachments WHERE notebook_id = ?1"
    );
    attachmentsStatement.run([id]);
    attachmentsStatement.free();

    const statement = this.db.prepare("DELETE FROM notebooks WHERE id = ?1");
    statement.run([id]);
    statement.free();

    await this.persistToDisk();
    return existing;
  }

  async listAttachments(notebookId: string): Promise<NotebookAttachment[]> {
    await this.ready;
    const statement = this.db.prepare(
      `SELECT id, notebook_id, filename, mime_type, size, created_at, updated_at
       FROM attachments
       WHERE notebook_id = ?1
       ORDER BY created_at DESC, id ASC`
    );
    statement.bind([notebookId]);

    const attachments: NotebookAttachment[] = [];
    while (statement.step()) {
      const row = statement.getAsObject() as {
        id: string;
        notebook_id: string;
        filename: string;
        mime_type: string;
        size: number;
        created_at: string;
        updated_at: string;
      };
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
    statement.free();
    return attachments;
  }

  async getAttachment(
    notebookId: string,
    attachmentId: string
  ): Promise<NotebookAttachmentContent | undefined> {
    await this.ready;
    const statement = this.db.prepare(
      `SELECT id, notebook_id, filename, mime_type, size, content, created_at, updated_at
       FROM attachments
       WHERE notebook_id = ?1 AND id = ?2
       LIMIT 1`
    );
    statement.bind([notebookId, attachmentId]);

    let attachment: NotebookAttachmentContent | undefined;
    if (statement.step()) {
      const row = statement.getAsObject() as {
        id: string;
        notebook_id: string;
        filename: string;
        mime_type: string;
        size: number;
        created_at: string;
        updated_at: string;
        content: Uint8Array;
      };
      attachment = {
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
    statement.free();
    return attachment;
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

    const statement = this.db.prepare(
      `INSERT INTO attachments (
        id, notebook_id, filename, mime_type, size, content, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    );

    statement.run([
      id,
      notebookId,
      input.filename,
      input.mimeType,
      size,
      content,
      now,
      now,
    ]);
    statement.free();

    await this.persistToDisk();

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
    const statement = this.db.prepare(
      "DELETE FROM attachments WHERE notebook_id = ?1 AND id = ?2"
    );
    statement.run([notebookId, attachmentId]);
    statement.free();
    const changes = this.db.getRowsModified();
    if (changes > 0) {
      await this.persistToDisk();
      return true;
    }
    return false;
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
    await this.persistToDisk();
  }

  private async initialize() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const apiRoot = path.resolve(here, "../../");
    const locateFile = (file: string) =>
      path.resolve(apiRoot, "node_modules/sql.js/dist", file);

    this.sqlModule = await initSqlJs({ locateFile });

    if (this.file !== ":memory:" && !(await this.fileExists(this.file))) {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
    }

    if (this.file !== ":memory:" && (await this.fileExists(this.file))) {
      const buffer = await fs.readFile(this.file);
      this.db = new this.sqlModule.Database(new Uint8Array(buffer));
    } else {
      this.db = new this.sqlModule.Database();
    }

    this.db.run("PRAGMA foreign_keys = ON");

    this.db.run(
      `CREATE TABLE IF NOT EXISTS notebooks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    );

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_notebooks_updated_at
        ON notebooks (updated_at DESC)`
    );

    this.db.run(
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

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_attachments_notebook
        ON attachments (notebook_id, created_at DESC, id ASC)`
    );

    this.db.run(
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    );

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_settings_updated_at
        ON settings (updated_at DESC, key ASC)`
    );

    this.db.run(
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

    this.db.run(
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

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_user_sessions_user
        ON user_sessions (user_id, updated_at DESC)`
    );

    this.db.run(
      `CREATE TABLE IF NOT EXISTS user_invitations (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        invited_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        accepted_at TEXT,
        revoked_at TEXT,
        FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL
      )`
    );

    this.db.run(
      `CREATE INDEX IF NOT EXISTS idx_user_invitations_email
        ON user_invitations (email, created_at DESC, id ASC)`
    );

    await this.persistToDisk();
  }

  private async persistToDisk() {
    if (this.file === ":memory:") {
      return;
    }
    const data = this.db.export();
    await fs.writeFile(this.file, Buffer.from(data));
  }

  private deserialize(raw: string): Notebook {
    const data = JSON.parse(raw);
    return ensureNotebookRuntimeVersion(NotebookSchema.parse(data));
  }

  private async fileExists(target: string) {
    try {
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
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
    const statement = db.prepare("SELECT key, value FROM settings");
    const result: Record<string, unknown> = {};
    try {
      while (statement.step()) {
        const row = statement.getAsObject() as { key?: string; value?: string };
        if (!row.key) {
          continue;
        }
        result[row.key] = row.value ? JSON.parse(row.value) : null;
      }
    } finally {
      statement.free();
    }
    return result;
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const db = await this.getDb();
    const statement = db.prepare(
      "SELECT value FROM settings WHERE key = ?1 LIMIT 1"
    );
    statement.bind([key]);
    try {
      if (!statement.step()) {
        return undefined;
      }
      const row = statement.getAsObject() as { value?: string };
      if (row.value == null) {
        return undefined;
      }
      return JSON.parse(row.value) as T;
    } finally {
      statement.free();
    }
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    if (value === undefined) {
      await this.delete(key);
      return;
    }
    const db = await this.getDb();
    const statement = db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    );
    const payload = JSON.stringify(value ?? null);
    const updatedAt = new Date().toISOString();
    try {
      statement.run([key, payload, updatedAt]);
    } finally {
      statement.free();
    }
    await this.notebooks.flush();
  }

  async delete(key: string): Promise<void> {
    const db = await this.getDb();
    const statement = db.prepare("DELETE FROM settings WHERE key = ?1");
    try {
      statement.run([key]);
    } finally {
      statement.free();
    }
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
  role: row.role as Invitation["role"],
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
    const statement = db.prepare(
      `INSERT INTO users (id, email, name, role, password_hash, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    );
    try {
      statement.run([
        id,
        email,
        input.name?.trim() ?? null,
        input.role ?? "editor",
        input.passwordHash,
        now,
        now,
      ]);
    } finally {
      statement.free();
    }
    await this.notebooks.flush();
    const created = await this.get(id);
    if (!created) {
      throw new Error("Failed to create user");
    }
    return created;
  }

  async get(id: string): Promise<User | undefined> {
    const db = await this.getDb();
    const statement = db.prepare(
      `SELECT id, email, name, role, password_hash, created_at, updated_at FROM users WHERE id = ?1 LIMIT 1`
    );
    statement.bind([id]);
    try {
      if (!statement.step()) {
        return undefined;
      }
      const row = statement.getAsObject() as {
        id: string;
        email: string;
        name: string | null;
        role: string;
        password_hash: string;
        created_at: string;
        updated_at: string;
      };
      return mapUserRow(row);
    } finally {
      statement.free();
    }
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const db = await this.getDb();
    const statement = db.prepare(
      `SELECT id, email, name, role, password_hash, created_at, updated_at FROM users WHERE email = ?1 LIMIT 1`
    );
    statement.bind([email.trim().toLowerCase()]);
    try {
      if (!statement.step()) {
        return undefined;
      }
      const row = statement.getAsObject() as {
        id: string;
        email: string;
        name: string | null;
        role: string;
        password_hash: string;
        created_at: string;
        updated_at: string;
      };
      return mapUserRow(row);
    } finally {
      statement.free();
    }
  }

  async update(id: string, updates: UpdateUserInput): Promise<User> {
    const db = await this.getDb();
    const setFragments: string[] = [];
    const values: unknown[] = [];

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

    const statement = db.prepare(
      `UPDATE users SET ${setFragments.join(", ")} WHERE id = ?`
    );
    try {
      statement.run(values);
    } finally {
      statement.free();
    }

    if (db.getRowsModified() === 0) {
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
    const statement = db.prepare(
      `SELECT id, email, name, role, password_hash, created_at, updated_at FROM users ORDER BY created_at ASC`
    );
    const users: User[] = [];
    try {
      while (statement.step()) {
        const row = statement.getAsObject() as {
          id: string;
          email: string;
          name: string | null;
          role: string;
          password_hash: string;
          created_at: string;
          updated_at: string;
        };
        users.push(mapUserRow(row));
      }
    } finally {
      statement.free();
    }
    return users;
  }

  async count(): Promise<number> {
    const db = await this.getDb();
    const statement = db.prepare(`SELECT COUNT(1) as count FROM users`);
    try {
      if (!statement.step()) {
        return 0;
      }
      const row = statement.getAsObject() as { count: number };
      return Number(row.count ?? 0);
    } finally {
      statement.free();
    }
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
    const statement = db.prepare(
      `INSERT INTO user_sessions (id, user_id, token_hash, created_at, updated_at, expires_at, revoked_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)`
    );
    try {
      statement.run([
        id,
        input.userId,
        input.tokenHash,
        now,
        now,
        input.expiresAt,
      ]);
    } finally {
      statement.free();
    }
    await this.notebooks.flush();
    const created = await this.findByTokenHash(input.tokenHash);
    if (!created) {
      throw new Error("Failed to create session");
    }
    return created;
  }

  async findByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
    const db = await this.getDb();
    const statement = db.prepare(
      `SELECT id, user_id, token_hash, created_at, updated_at, expires_at, revoked_at FROM user_sessions WHERE token_hash = ?1 LIMIT 1`
    );
    statement.bind([tokenHash]);
    try {
      if (!statement.step()) {
        return undefined;
      }
      const row = statement.getAsObject() as {
        id: string;
        user_id: string;
        token_hash: string;
        created_at: string;
        updated_at: string;
        expires_at: string;
        revoked_at: string | null;
      };
      return mapSessionRow(row);
    } finally {
      statement.free();
    }
  }

  async touch(id: string): Promise<void> {
    const db = await this.getDb();
    const statement = db.prepare(
      `UPDATE user_sessions SET updated_at = ?1 WHERE id = ?2`
    );
    try {
      statement.run([new Date().toISOString(), id]);
    } finally {
      statement.free();
    }
    await this.notebooks.flush();
  }

  async revoke(id: string): Promise<void> {
    const db = await this.getDb();
    const statement = db.prepare(
      `UPDATE user_sessions SET revoked_at = ?1 WHERE id = ?2`
    );
    try {
      statement.run([new Date().toISOString(), id]);
    } finally {
      statement.free();
    }
    await this.notebooks.flush();
  }

  async revokeForUser(userId: string): Promise<void> {
    const db = await this.getDb();
    const statement = db.prepare(
      `UPDATE user_sessions SET revoked_at = ?1 WHERE user_id = ?2`
    );
    try {
      statement.run([new Date().toISOString(), userId]);
    } finally {
      statement.free();
    }
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
    const statement = db.prepare(
      `INSERT INTO user_invitations (
         id, email, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL)`
    );
    try {
      statement.run([
        id,
        email,
        input.role,
        input.tokenHash,
        input.invitedBy ?? null,
        now,
        now,
        input.expiresAt,
      ]);
    } finally {
      statement.free();
    }
    await this.notebooks.flush();
    const created = await this.get(id);
    if (!created) {
      throw new Error("Failed to create invitation");
    }
    return created;
  }

  async get(id: string): Promise<Invitation | undefined> {
    const db = await this.getDb();
    const statement = db.prepare(
      `SELECT id, email, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE id = ?1
       LIMIT 1`
    );
    statement.bind([id]);
    try {
      if (!statement.step()) {
        return undefined;
      }
      const row = statement.getAsObject() as {
        id: string;
        email: string;
        role: string;
        token_hash: string;
        invited_by: string | null;
        created_at: string;
        updated_at: string;
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
      };
      return mapInvitationRow(row);
    } finally {
      statement.free();
    }
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | undefined> {
    const db = await this.getDb();
    const statement = db.prepare(
      `SELECT id, email, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE token_hash = ?1
       LIMIT 1`
    );
    statement.bind([tokenHash]);
    try {
      if (!statement.step()) {
        return undefined;
      }
      const row = statement.getAsObject() as {
        id: string;
        email: string;
        role: string;
        token_hash: string;
        invited_by: string | null;
        created_at: string;
        updated_at: string;
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
      };
      return mapInvitationRow(row);
    } finally {
      statement.free();
    }
  }

  async findActiveByEmail(email: string): Promise<Invitation | undefined> {
    const db = await this.getDb();
    const statement = db.prepare(
      `SELECT id, email, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       WHERE email = ?1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
    );
    statement.bind([email.trim().toLowerCase()]);
    try {
      if (!statement.step()) {
        return undefined;
      }
      const row = statement.getAsObject() as {
        id: string;
        email: string;
        role: string;
        token_hash: string;
        invited_by: string | null;
        created_at: string;
        updated_at: string;
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
      };
      const invitation = mapInvitationRow(row);
      if (invitation.acceptedAt || invitation.revokedAt) {
        return undefined;
      }
      return invitation;
    } finally {
      statement.free();
    }
  }

  async list(): Promise<Invitation[]> {
    const db = await this.getDb();
    const statement = db.prepare(
      `SELECT id, email, role, token_hash, invited_by, created_at, updated_at, expires_at, accepted_at, revoked_at
       FROM user_invitations
       ORDER BY created_at DESC, id DESC`
    );
    const invitations: Invitation[] = [];
    try {
      while (statement.step()) {
        const row = statement.getAsObject() as {
          id: string;
          email: string;
          role: string;
          token_hash: string;
          invited_by: string | null;
          created_at: string;
          updated_at: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
        };
        invitations.push(mapInvitationRow(row));
      }
    } finally {
      statement.free();
    }
    return invitations;
  }

  async markAccepted(id: string): Promise<Invitation | undefined> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const statement = db.prepare(
      `UPDATE user_invitations
       SET accepted_at = ?1, updated_at = ?1
       WHERE id = ?2`
    );
    try {
      statement.run([now, id]);
    } finally {
      statement.free();
    }
    await this.notebooks.flush();
    return this.get(id);
  }

  async revoke(id: string): Promise<Invitation | undefined> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const statement = db.prepare(
      `UPDATE user_invitations
       SET revoked_at = ?1, updated_at = ?1
       WHERE id = ?2`
    );
    try {
      statement.run([now, id]);
    } finally {
      statement.free();
    }
    await this.notebooks.flush();
    return this.get(id);
  }
}
