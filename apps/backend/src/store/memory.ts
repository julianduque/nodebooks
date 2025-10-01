import {
  createEmptyNotebook,
  ensureNotebookRuntimeVersion,
  NotebookSchema,
  type Notebook,
} from "@nodebooks/notebook-schema";
import { customAlphabet } from "nanoid";
import type {
  NotebookStore,
  NotebookSession,
  SessionManager,
  SettingsStore,
  NotebookAttachment,
  NotebookAttachmentContent,
} from "../types.js";

const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 12);

export class InMemoryNotebookStore implements NotebookStore {
  private notebooks = new Map<string, Notebook>();
  private attachments = new Map<
    string,
    Map<string, NotebookAttachmentContent>
  >();

  constructor(initialNotebooks: Notebook[] = []) {
    initialNotebooks.forEach((notebook) => {
      const parsed = ensureNotebookRuntimeVersion(
        NotebookSchema.parse(notebook)
      );
      this.notebooks.set(parsed.id, parsed);
      if (!this.attachments.has(parsed.id)) {
        this.attachments.set(parsed.id, new Map());
      }
    });

    if (this.notebooks.size === 0) {
      const sample = ensureNotebookRuntimeVersion(
        createEmptyNotebook({
          name: "Welcome to NodeBooks",
          cells: [],
        })
      );
      this.notebooks.set(sample.id, sample);
      this.attachments.set(sample.id, new Map());
    }
  }

  async all(): Promise<Notebook[]> {
    return Array.from(this.notebooks.values());
  }

  async get(id: string): Promise<Notebook | undefined> {
    return this.notebooks.get(id);
  }

  async save(notebook: Notebook): Promise<Notebook> {
    const parsed = ensureNotebookRuntimeVersion(
      NotebookSchema.parse({
        ...notebook,
        updatedAt: new Date().toISOString(),
      })
    );
    this.notebooks.set(parsed.id, parsed);
    if (!this.attachments.has(parsed.id)) {
      this.attachments.set(parsed.id, new Map());
    }
    return parsed;
  }

  async remove(id: string): Promise<Notebook | undefined> {
    const notebook = this.notebooks.get(id);
    this.notebooks.delete(id);
    this.attachments.delete(id);
    return notebook;
  }

  async listAttachments(notebookId: string): Promise<NotebookAttachment[]> {
    const bucket = this.attachments.get(notebookId);
    if (!bucket) {
      return [];
    }
    return Array.from(bucket.values())
      .map<NotebookAttachment>(({ content: _content, ...rest }) => ({
        ...rest,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getAttachment(
    notebookId: string,
    attachmentId: string
  ): Promise<NotebookAttachmentContent | undefined> {
    const bucket = this.attachments.get(notebookId);
    return bucket?.get(attachmentId);
  }

  async saveAttachment(
    notebookId: string,
    input: {
      filename: string;
      mimeType: string;
      content: Uint8Array;
    }
  ): Promise<NotebookAttachment> {
    if (!this.notebooks.has(notebookId)) {
      throw new Error(`Notebook ${notebookId} not found`);
    }

    const bucket = this.attachments.get(notebookId) ?? new Map();
    this.attachments.set(notebookId, bucket);

    const id = nanoid();
    const now = new Date().toISOString();
    const content = new Uint8Array(input.content);
    const record: NotebookAttachmentContent = {
      id,
      notebookId,
      filename: input.filename,
      mimeType: input.mimeType,
      size: content.byteLength,
      createdAt: now,
      updatedAt: now,
      content,
    };

    bucket.set(id, record);
    return {
      id,
      notebookId,
      filename: record.filename,
      mimeType: record.mimeType,
      size: record.size,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async removeAttachment(
    notebookId: string,
    attachmentId: string
  ): Promise<boolean> {
    const bucket = this.attachments.get(notebookId);
    if (!bucket) {
      return false;
    }
    return bucket.delete(attachmentId);
  }
}

export class InMemorySettingsStore implements SettingsStore {
  private readonly settings = new Map<string, unknown>();

  async all(): Promise<Record<string, unknown>> {
    return Object.fromEntries(this.settings.entries());
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.settings.get(key) as T | undefined;
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.settings.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.settings.delete(key);
  }
}

export class InMemorySessionManager implements SessionManager {
  private sessions = new Map<string, NotebookSession>();

  constructor(private readonly store: NotebookStore) {}

  async createSession(notebookId: string): Promise<NotebookSession> {
    if (!(await this.store.get(notebookId))) {
      throw new Error(`Notebook ${notebookId} not found`);
    }

    const session: NotebookSession = {
      id: nanoid(),
      notebookId,
      createdAt: new Date().toISOString(),
      status: "open",
    };

    this.sessions.set(session.id, session);
    return session;
  }

  async closeSession(sessionId: string): Promise<NotebookSession | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    const next: NotebookSession = { ...session, status: "closed" };
    this.sessions.set(session.id, next);
    return next;
  }

  async listSessions(notebookId?: string): Promise<NotebookSession[]> {
    const sessions = Array.from(this.sessions.values());
    if (!notebookId) {
      return sessions;
    }
    return sessions.filter((session) => session.notebookId === notebookId);
  }
}
