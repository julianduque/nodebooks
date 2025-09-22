import type { Notebook } from "@nodebooks/notebook-schema";

export interface NotebookSession {
  id: string;
  notebookId: string;
  createdAt: string;
  status: "open" | "closed";
}

export interface SessionManager {
  createSession(notebookId: string): Promise<NotebookSession>;
  closeSession(sessionId: string): Promise<NotebookSession | undefined>;
  listSessions(notebookId?: string): Promise<NotebookSession[]>;
}

export interface NotebookStore {
  all(): Promise<Notebook[]>;
  get(id: string): Promise<Notebook | undefined>;
  save(notebook: Notebook): Promise<Notebook>;
  remove(id: string): Promise<Notebook | undefined>;
}
