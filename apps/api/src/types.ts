import type { Notebook } from "@nodebooks/notebook-schema";

export interface NotebookSession {
  id: string;
  notebookId: string;
  createdAt: string;
  status: "open" | "closed";
}

export interface SessionManager {
  createSession(notebookId: string): NotebookSession;
  closeSession(sessionId: string): NotebookSession | undefined;
  listSessions(notebookId?: string): NotebookSession[];
}

export interface NotebookStore {
  all(): Notebook[];
  get(id: string): Notebook | undefined;
  save(notebook: Notebook): Notebook;
  remove(id: string): Notebook | undefined;
}
