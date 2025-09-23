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
} from "../types.js";

const nanoid = customAlphabet("1234567890abcdefghijklmnopqrstuvwxyz", 12);

export class InMemoryNotebookStore implements NotebookStore {
  private notebooks = new Map<string, Notebook>();

  constructor(initialNotebooks: Notebook[] = []) {
    initialNotebooks.forEach((notebook) => {
      const parsed = ensureNotebookRuntimeVersion(
        NotebookSchema.parse(notebook)
      );
      this.notebooks.set(parsed.id, parsed);
    });

    if (this.notebooks.size === 0) {
      const sample = ensureNotebookRuntimeVersion(
        createEmptyNotebook({
          name: "Welcome to NodeBooks",
          cells: [],
        })
      );
      this.notebooks.set(sample.id, sample);
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
    return parsed;
  }

  async remove(id: string): Promise<Notebook | undefined> {
    const notebook = this.notebooks.get(id);
    this.notebooks.delete(id);
    return notebook;
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
