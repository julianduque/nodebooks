import { promises as fs } from "node:fs";
import path from "node:path";
import initSqlJs, {
  type Database as SqlDatabase,
  type SqlJsStatic,
} from "sql.js";
import { NotebookSchema, type Notebook } from "@nodebooks/notebook-schema";
import type { NotebookStore } from "../types.js";

export interface SqliteNotebookStoreOptions {
  databaseFile?: string;
}

export class SqliteNotebookStore implements NotebookStore {
  private db!: SqlDatabase;
  private readonly file: string;
  private readonly ready: Promise<void>;
  private sqlModule!: SqlJsStatic;

  constructor(options: SqliteNotebookStoreOptions = {}) {
    this.file =
      options.databaseFile ??
      path.resolve(process.cwd(), "data", "nodebooks.sqlite");
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
    const parsed = NotebookSchema.parse({
      ...notebook,
      updatedAt: new Date().toISOString(),
    });

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

    await this.persist();
    return parsed;
  }

  async remove(id: string): Promise<Notebook | undefined> {
    await this.ready;
    const existing = await this.get(id);
    if (!existing) {
      return undefined;
    }

    const statement = this.db.prepare("DELETE FROM notebooks WHERE id = ?1");
    statement.run([id]);
    statement.free();

    await this.persist();
    return existing;
  }

  private async initialize() {
    const locateFile = (file: string) =>
      path.resolve(process.cwd(), "node_modules/sql.js/dist", file);

    this.sqlModule = await initSqlJs({ locateFile });

    if (this.file !== ":memory:") {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
    }

    if (this.file !== ":memory:" && (await this.fileExists(this.file))) {
      const buffer = await fs.readFile(this.file);
      this.db = new this.sqlModule.Database(new Uint8Array(buffer));
    } else {
      this.db = new this.sqlModule.Database();
    }

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

    await this.persist();
  }

  private async persist() {
    if (this.file === ":memory:") {
      return;
    }
    const data = this.db.export();
    await fs.writeFile(this.file, Buffer.from(data));
  }

  private deserialize(raw: string): Notebook {
    const data = JSON.parse(raw);
    return NotebookSchema.parse(data);
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
