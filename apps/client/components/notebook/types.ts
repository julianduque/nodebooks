import type { NotebookTemplateId as SchemaNotebookTemplateId } from "@nodebooks/notebook-schema";

export interface NotebookSessionSummary {
  id: string;
  notebookId: string;
  createdAt: string;
  status: "open" | "closed";
}

export type NotebookTemplateId = SchemaNotebookTemplateId;

export interface OutlineItem {
  id: string;
  cellId: string;
  title: string;
  level: number;
}

export interface NotebookViewProps {
  initialNotebookId?: string;
}

export type WorkspaceRole = "admin" | "editor" | "viewer";

export interface SafeWorkspaceUser {
  id: string;
  email: string;
  name: string | null;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationSummary {
  id: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedByUser?: SafeWorkspaceUser | null;
}
