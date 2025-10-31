import type {
  NotebookTemplateId as SchemaNotebookTemplateId,
  Project,
  ProjectRole as SchemaProjectRole,
} from "@nodebooks/notebook-schema";
import type { Notebook } from "@/types/notebook";

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
export type NotebookRole = "editor" | "viewer";
export type ProjectRole = SchemaProjectRole;

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
  notebookId: string;
  role: NotebookRole;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedByUser?: SafeWorkspaceUser | null;
}

export interface NotebookCollaboratorSummary {
  id: string;
  notebookId: string;
  userId: string;
  role: NotebookRole;
  createdAt: string;
  updatedAt: string;
  user: SafeWorkspaceUser;
}

export type NotebookWithAccess = Notebook & { accessRole?: NotebookRole };

export interface ProjectCollaboratorSummary {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
  updatedAt: string;
  user: SafeWorkspaceUser;
}

export interface ProjectInvitationSummary {
  id: string;
  email: string;
  projectId: string;
  role: ProjectRole;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  invitedByUser?: SafeWorkspaceUser | null;
}

export interface ProjectWithNotebooks {
  project: Project;
  notebooks: NotebookWithAccess[];
}
