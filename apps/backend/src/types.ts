import type { Notebook } from "@nodebooks/notebook-schema";

export type UserRole = "admin" | "editor" | "viewer";
export type NotebookRole = "editor" | "viewer";
export type ProjectRole = NotebookRole;

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export type SafeUser = Omit<User, "passwordHash">;

export interface CreateUserInput {
  email: string;
  name?: string | null;
  passwordHash: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  name?: string | null;
  passwordHash?: string;
  role?: UserRole;
}

export interface UserStore {
  create(input: CreateUserInput): Promise<User>;
  get(id: string): Promise<User | undefined>;
  findByEmail(email: string): Promise<User | undefined>;
  update(id: string, updates: UpdateUserInput): Promise<User>;
  list(): Promise<User[]>;
  count(): Promise<number>;
}

export interface AuthSession {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface AuthSessionStore {
  create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<AuthSession>;
  findByTokenHash(tokenHash: string): Promise<AuthSession | undefined>;
  touch(id: string): Promise<void>;
  revoke(id: string): Promise<void>;
  revokeForUser(userId: string): Promise<void>;
}

export interface Invitation {
  id: string;
  email: string;
  notebookId: string;
  role: NotebookRole;
  tokenHash: string;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export type SafeInvitation = Omit<Invitation, "tokenHash">;

export interface CreateInvitationInput {
  email: string;
  notebookId: string;
  role: NotebookRole;
  tokenHash: string;
  invitedBy?: string | null;
  expiresAt: string;
}

export interface InvitationStore {
  create(input: CreateInvitationInput): Promise<Invitation>;
  get(id: string): Promise<Invitation | undefined>;
  findByTokenHash(tokenHash: string): Promise<Invitation | undefined>;
  findActiveByEmail(
    email: string,
    notebookId: string
  ): Promise<Invitation | undefined>;
  list(): Promise<Invitation[]>;
  listByNotebook(notebookId: string): Promise<Invitation[]>;
  markAccepted(id: string): Promise<Invitation | undefined>;
  revoke(id: string): Promise<Invitation | undefined>;
}

export interface NotebookCollaborator {
  id: string;
  notebookId: string;
  userId: string;
  role: NotebookRole;
  createdAt: string;
  updatedAt: string;
}

export interface NotebookCollaboratorStore {
  listByNotebook(notebookId: string): Promise<NotebookCollaborator[]>;
  listNotebookIdsForUser(userId: string): Promise<string[]>;
  listForUser(userId: string): Promise<NotebookCollaborator[]>;
  get(
    notebookId: string,
    userId: string
  ): Promise<NotebookCollaborator | undefined>;
  upsert(input: {
    notebookId: string;
    userId: string;
    role: NotebookRole;
  }): Promise<NotebookCollaborator>;
  updateRole(
    notebookId: string,
    userId: string,
    role: NotebookRole
  ): Promise<NotebookCollaborator | undefined>;
  remove(notebookId: string, userId: string): Promise<boolean>;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
}

export interface UpdateProjectInput {
  name?: string;
}

export interface ProjectStore {
  list(): Promise<Project[]>;
  get(id: string): Promise<Project | undefined>;
  create(input: CreateProjectInput): Promise<Project>;
  update(id: string, updates: UpdateProjectInput): Promise<Project>;
  remove(id: string): Promise<boolean>;
}

export interface ProjectInvitation {
  id: string;
  email: string;
  projectId: string;
  role: ProjectRole;
  tokenHash: string;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export type SafeProjectInvitation = Omit<ProjectInvitation, "tokenHash">;

export interface CreateProjectInvitationInput {
  email: string;
  projectId: string;
  role: ProjectRole;
  tokenHash: string;
  invitedBy?: string | null;
  expiresAt: string;
}

export interface ProjectInvitationStore {
  create(input: CreateProjectInvitationInput): Promise<ProjectInvitation>;
  get(id: string): Promise<ProjectInvitation | undefined>;
  findByTokenHash(tokenHash: string): Promise<ProjectInvitation | undefined>;
  findActiveByEmail(
    email: string,
    projectId: string
  ): Promise<ProjectInvitation | undefined>;
  list(): Promise<ProjectInvitation[]>;
  listByProject(projectId: string): Promise<ProjectInvitation[]>;
  markAccepted(id: string): Promise<ProjectInvitation | undefined>;
  revoke(id: string): Promise<ProjectInvitation | undefined>;
}

export interface ProjectCollaborator {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCollaboratorStore {
  listByProject(projectId: string): Promise<ProjectCollaborator[]>;
  listProjectIdsForUser(userId: string): Promise<string[]>;
  get(
    projectId: string,
    userId: string
  ): Promise<ProjectCollaborator | undefined>;
  upsert(input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
  }): Promise<ProjectCollaborator>;
  updateRole(
    projectId: string,
    userId: string,
    role: ProjectRole
  ): Promise<ProjectCollaborator | undefined>;
  remove(projectId: string, userId: string): Promise<boolean>;
  removeAllForProject(projectId: string): Promise<void>;
}

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
