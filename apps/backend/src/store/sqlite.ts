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
} from "../types.js";

export interface SqliteNotebookStoreOptions {
  databaseFile?: string;
}

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
