import type { Notebook } from "@nodebooks/notebook-schema";

export interface NotebookAttachment {
  id: string;
  notebookId: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotebookAttachmentContent extends NotebookAttachment {
  content: Uint8Array;
}

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
  listAttachments(notebookId: string): Promise<NotebookAttachment[]>;
  getAttachment(
    notebookId: string,
    attachmentId: string
  ): Promise<NotebookAttachmentContent | undefined>;
  saveAttachment(
    notebookId: string,
    input: {
      filename: string;
      mimeType: string;
      content: Uint8Array;
    }
  ): Promise<NotebookAttachment>;
  removeAttachment(notebookId: string, attachmentId: string): Promise<boolean>;
}

export interface SettingsStore {
  all(): Promise<Record<string, unknown>>;
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}
