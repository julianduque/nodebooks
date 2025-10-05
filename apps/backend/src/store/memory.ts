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
  User,
  UserStore,
  CreateUserInput,
  UpdateUserInput,
  AuthSession,
  AuthSessionStore,
  Invitation,
  InvitationStore,
  CreateInvitationInput,
  NotebookCollaborator,
  NotebookCollaboratorStore,
  NotebookRole,
  Project,
  ProjectStore,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectCollaborator,
  ProjectCollaboratorStore,
  ProjectInvitation,
  ProjectInvitationStore,
  CreateProjectInvitationInput,
  ProjectRole,
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

const userNanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 18);

const cloneUser = (user: User): User => ({ ...user });

export class InMemoryUserStore implements UserStore {
  private readonly usersById = new Map<string, User>();
  private readonly usersByEmail = new Map<string, string>();

  async create(input: CreateUserInput): Promise<User> {
    const email = input.email.trim().toLowerCase();
    if (this.usersByEmail.has(email)) {
      throw new Error("User with that email already exists");
    }

    const now = new Date().toISOString();
    const user: User = {
      id: userNanoid(),
      email,
      name: input.name?.trim() ?? null,
      role: input.role ?? "editor",
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    };

    this.usersById.set(user.id, user);
    this.usersByEmail.set(email, user.id);
    return cloneUser(user);
  }

  async get(id: string): Promise<User | undefined> {
    const user = this.usersById.get(id);
    return user ? cloneUser(user) : undefined;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const id = this.usersByEmail.get(email.trim().toLowerCase());
    if (!id) {
      return undefined;
    }
    return this.get(id);
  }

  async update(id: string, updates: UpdateUserInput): Promise<User> {
    const existing = this.usersById.get(id);
    if (!existing) {
      throw new Error("User not found");
    }

    if (typeof updates.name !== "undefined") {
      existing.name = updates.name?.trim() ?? null;
    }
    if (typeof updates.passwordHash === "string") {
      existing.passwordHash = updates.passwordHash;
    }
    if (typeof updates.role === "string") {
      existing.role = updates.role;
    }

    existing.updatedAt = new Date().toISOString();
    return cloneUser(existing);
  }

  async list(): Promise<User[]> {
    return Array.from(this.usersById.values()).map(cloneUser);
  }

  async count(): Promise<number> {
    return this.usersById.size;
  }
}

const cloneAuthSession = (session: AuthSession): AuthSession => ({
  ...session,
});

const cloneInvitation = (invitation: Invitation): Invitation => ({
  ...invitation,
});

const cloneCollaborator = (
  collaborator: NotebookCollaborator
): NotebookCollaborator => ({
  ...collaborator,
});

const cloneProject = (project: Project): Project => ({
  ...project,
});

const cloneProjectInvitation = (
  invitation: ProjectInvitation
): ProjectInvitation => ({
  ...invitation,
});

const cloneProjectCollaborator = (
  collaborator: ProjectCollaborator
): ProjectCollaborator => ({
  ...collaborator,
});

export class InMemoryAuthSessionStore implements AuthSessionStore {
  private readonly sessionsById = new Map<string, AuthSession>();
  private readonly sessionsByToken = new Map<string, string>();

  async create(input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<AuthSession> {
    const now = new Date().toISOString();
    const session: AuthSession = {
      id: userNanoid(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };

    this.sessionsById.set(session.id, session);
    this.sessionsByToken.set(session.tokenHash, session.id);
    return cloneAuthSession(session);
  }

  async findByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
    const id = this.sessionsByToken.get(tokenHash);
    if (!id) {
      return undefined;
    }
    const session = this.sessionsById.get(id);
    return session ? cloneAuthSession(session) : undefined;
  }

  async touch(id: string): Promise<void> {
    const session = this.sessionsById.get(id);
    if (!session) {
      return;
    }
    session.updatedAt = new Date().toISOString();
  }

  async revoke(id: string): Promise<void> {
    const session = this.sessionsById.get(id);
    if (!session) {
      return;
    }
    session.revokedAt = new Date().toISOString();
  }

  async revokeForUser(userId: string): Promise<void> {
    for (const session of this.sessionsById.values()) {
      if (session.userId === userId) {
        session.revokedAt = new Date().toISOString();
      }
    }
  }
}

export class InMemoryInvitationStore implements InvitationStore {
  private readonly invitationsById = new Map<string, Invitation>();
  private readonly invitationsByToken = new Map<string, string>();
  private readonly invitationsByEmail = new Map<string, string>();

  private emailKey(email: string, notebookId: string): string {
    return `${email.trim().toLowerCase()}::${notebookId}`;
  }

  async create(input: CreateInvitationInput): Promise<Invitation> {
    const email = input.email.trim().toLowerCase();
    const now = new Date().toISOString();
    const invitation: Invitation = {
      id: userNanoid(),
      email,
      notebookId: input.notebookId,
      role: input.role,
      tokenHash: input.tokenHash,
      invitedBy: input.invitedBy ?? null,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
      acceptedAt: null,
      revokedAt: null,
    };

    this.invitationsById.set(invitation.id, invitation);
    this.invitationsByToken.set(invitation.tokenHash, invitation.id);
    this.invitationsByEmail.set(
      this.emailKey(email, input.notebookId),
      invitation.id
    );
    return cloneInvitation(invitation);
  }

  async get(id: string): Promise<Invitation | undefined> {
    const invitation = this.invitationsById.get(id);
    return invitation ? cloneInvitation(invitation) : undefined;
  }

  async findByTokenHash(tokenHash: string): Promise<Invitation | undefined> {
    const id = this.invitationsByToken.get(tokenHash);
    if (!id) {
      return undefined;
    }
    return this.get(id);
  }

  async findActiveByEmail(
    email: string,
    notebookId: string
  ): Promise<Invitation | undefined> {
    const id = this.invitationsByEmail.get(this.emailKey(email, notebookId));
    if (!id) {
      return undefined;
    }
    const invitation = this.invitationsById.get(id);
    if (!invitation) {
      return undefined;
    }
    if (invitation.acceptedAt || invitation.revokedAt) {
      return undefined;
    }
    return cloneInvitation(invitation);
  }

  async list(): Promise<Invitation[]> {
    return Array.from(this.invitationsById.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(cloneInvitation);
  }

  async listByNotebook(notebookId: string): Promise<Invitation[]> {
    return Array.from(this.invitationsById.values())
      .filter((invitation) => invitation.notebookId === notebookId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(cloneInvitation);
  }

  async markAccepted(id: string): Promise<Invitation | undefined> {
    const invitation = this.invitationsById.get(id);
    if (!invitation) {
      return undefined;
    }
    const now = new Date().toISOString();
    invitation.acceptedAt = now;
    invitation.updatedAt = now;
    return cloneInvitation(invitation);
  }

  async revoke(id: string): Promise<Invitation | undefined> {
    const invitation = this.invitationsById.get(id);
    if (!invitation) {
      return undefined;
    }
    const now = new Date().toISOString();
    invitation.revokedAt = now;
    invitation.updatedAt = now;
    return cloneInvitation(invitation);
  }
}

export class InMemoryNotebookCollaboratorStore
  implements NotebookCollaboratorStore
{
  private readonly collaborators = new Map<string, NotebookCollaborator>();
  private readonly collaboratorIdsByNotebook = new Map<string, Set<string>>();
  private readonly collaboratorIdsByUser = new Map<string, Set<string>>();

  private key(notebookId: string, userId: string): string {
    return `${notebookId}::${userId}`;
  }

  async listByNotebook(notebookId: string): Promise<NotebookCollaborator[]> {
    const ids = this.collaboratorIdsByNotebook.get(notebookId);
    if (!ids) {
      return [];
    }
    return Array.from(ids.values())
      .map((id) => this.collaborators.get(id))
      .filter((collaborator): collaborator is NotebookCollaborator =>
        Boolean(collaborator)
      )
      .map((collaborator) => cloneCollaborator(collaborator));
  }

  async listNotebookIdsForUser(userId: string): Promise<string[]> {
    const ids = this.collaboratorIdsByUser.get(userId);
    if (!ids) {
      return [];
    }
    return Array.from(ids.values()).map(
      (compoundId) => compoundId.split("::", 1)[0] ?? ""
    );
  }

  async listForUser(userId: string): Promise<NotebookCollaborator[]> {
    const ids = this.collaboratorIdsByUser.get(userId);
    if (!ids) {
      return [];
    }
    return Array.from(ids.values())
      .map((compoundId) => this.collaborators.get(compoundId))
      .filter((collaborator): collaborator is NotebookCollaborator =>
        Boolean(collaborator)
      )
      .map((collaborator) => cloneCollaborator(collaborator));
  }

  async get(
    notebookId: string,
    userId: string
  ): Promise<NotebookCollaborator | undefined> {
    const collaborator = this.collaborators.get(this.key(notebookId, userId));
    return collaborator ? cloneCollaborator(collaborator) : undefined;
  }

  async upsert(input: {
    notebookId: string;
    userId: string;
    role: NotebookRole;
  }): Promise<NotebookCollaborator> {
    const key = this.key(input.notebookId, input.userId);
    const existing = this.collaborators.get(key);
    const now = new Date().toISOString();
    if (existing) {
      existing.role = input.role;
      existing.updatedAt = now;
      return cloneCollaborator(existing);
    }
    const collaborator: NotebookCollaborator = {
      id: userNanoid(),
      notebookId: input.notebookId,
      userId: input.userId,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    };
    this.collaborators.set(key, collaborator);
    const byNotebook = this.collaboratorIdsByNotebook.get(input.notebookId);
    if (byNotebook) {
      byNotebook.add(key);
    } else {
      this.collaboratorIdsByNotebook.set(input.notebookId, new Set([key]));
    }
    const byUser = this.collaboratorIdsByUser.get(input.userId);
    if (byUser) {
      byUser.add(key);
    } else {
      this.collaboratorIdsByUser.set(input.userId, new Set([key]));
    }
    return cloneCollaborator(collaborator);
  }

  async updateRole(
    notebookId: string,
    userId: string,
    role: NotebookRole
  ): Promise<NotebookCollaborator | undefined> {
    const collaborator = this.collaborators.get(this.key(notebookId, userId));
    if (!collaborator) {
      return undefined;
    }
    collaborator.role = role;
    collaborator.updatedAt = new Date().toISOString();
    return cloneCollaborator(collaborator);
  }

  async remove(notebookId: string, userId: string): Promise<boolean> {
    const key = this.key(notebookId, userId);
    const removed = this.collaborators.delete(key);
    if (!removed) {
      return false;
    }
    const byNotebook = this.collaboratorIdsByNotebook.get(notebookId);
    if (byNotebook) {
      byNotebook.delete(key);
      if (byNotebook.size === 0) {
        this.collaboratorIdsByNotebook.delete(notebookId);
      }
    }
    const byUser = this.collaboratorIdsByUser.get(userId);
    if (byUser) {
      byUser.delete(key);
      if (byUser.size === 0) {
        this.collaboratorIdsByUser.delete(userId);
      }
    }
    return true;
  }
}

export class InMemoryProjectStore implements ProjectStore {
  private readonly projectsById = new Map<string, Project>();

  async list(): Promise<Project[]> {
    return Array.from(this.projectsById.values())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(cloneProject);
  }

  async get(id: string): Promise<Project | undefined> {
    const project = this.projectsById.get(id);
    return project ? cloneProject(project) : undefined;
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: userNanoid(),
      name: input.name.trim(),
      createdAt: now,
      updatedAt: now,
    };
    this.projectsById.set(project.id, project);
    return cloneProject(project);
  }

  async update(id: string, updates: UpdateProjectInput): Promise<Project> {
    const existing = this.projectsById.get(id);
    if (!existing) {
      throw new Error("Project not found");
    }
    if (typeof updates.name === "string") {
      existing.name = updates.name.trim();
    }
    existing.updatedAt = new Date().toISOString();
    return cloneProject(existing);
  }

  async remove(id: string): Promise<boolean> {
    return this.projectsById.delete(id);
  }
}

export class InMemoryProjectCollaboratorStore
  implements ProjectCollaboratorStore
{
  private readonly collaborators = new Map<string, ProjectCollaborator>();
  private readonly collaboratorIdsByProject = new Map<string, Set<string>>();
  private readonly collaboratorIdsByUser = new Map<string, Set<string>>();

  private key(projectId: string, userId: string): string {
    return `${projectId}::${userId}`;
  }

  async listByProject(projectId: string): Promise<ProjectCollaborator[]> {
    const ids = this.collaboratorIdsByProject.get(projectId);
    if (!ids) {
      return [];
    }
    return Array.from(ids.values())
      .map((id) => this.collaborators.get(id))
      .filter((collaborator): collaborator is ProjectCollaborator =>
        Boolean(collaborator)
      )
      .map((collaborator) => cloneProjectCollaborator(collaborator));
  }

  async listProjectIdsForUser(userId: string): Promise<string[]> {
    const ids = this.collaboratorIdsByUser.get(userId);
    if (!ids) {
      return [];
    }
    return Array.from(ids.values()).map(
      (compoundId) => compoundId.split("::", 1)[0] ?? ""
    );
  }

  async get(
    projectId: string,
    userId: string
  ): Promise<ProjectCollaborator | undefined> {
    const collaborator = this.collaborators.get(this.key(projectId, userId));
    return collaborator ? cloneProjectCollaborator(collaborator) : undefined;
  }

  async upsert(input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
  }): Promise<ProjectCollaborator> {
    const key = this.key(input.projectId, input.userId);
    const existing = this.collaborators.get(key);
    const now = new Date().toISOString();
    if (existing) {
      existing.role = input.role;
      existing.updatedAt = now;
      return cloneProjectCollaborator(existing);
    }
    const collaborator: ProjectCollaborator = {
      id: userNanoid(),
      projectId: input.projectId,
      userId: input.userId,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    };
    this.collaborators.set(key, collaborator);
    const byProject = this.collaboratorIdsByProject.get(input.projectId);
    if (byProject) {
      byProject.add(key);
    } else {
      this.collaboratorIdsByProject.set(input.projectId, new Set([key]));
    }
    const byUser = this.collaboratorIdsByUser.get(input.userId);
    if (byUser) {
      byUser.add(key);
    } else {
      this.collaboratorIdsByUser.set(input.userId, new Set([key]));
    }
    return cloneProjectCollaborator(collaborator);
  }

  async updateRole(
    projectId: string,
    userId: string,
    role: ProjectRole
  ): Promise<ProjectCollaborator | undefined> {
    const collaborator = this.collaborators.get(this.key(projectId, userId));
    if (!collaborator) {
      return undefined;
    }
    collaborator.role = role;
    collaborator.updatedAt = new Date().toISOString();
    return cloneProjectCollaborator(collaborator);
  }

  async remove(projectId: string, userId: string): Promise<boolean> {
    const key = this.key(projectId, userId);
    const removed = this.collaborators.delete(key);
    if (!removed) {
      return false;
    }
    const byProject = this.collaboratorIdsByProject.get(projectId);
    if (byProject) {
      byProject.delete(key);
      if (byProject.size === 0) {
        this.collaboratorIdsByProject.delete(projectId);
      }
    }
    const byUser = this.collaboratorIdsByUser.get(userId);
    if (byUser) {
      byUser.delete(key);
      if (byUser.size === 0) {
        this.collaboratorIdsByUser.delete(userId);
      }
    }
    return true;
  }

  async removeAllForProject(projectId: string): Promise<void> {
    const ids = this.collaboratorIdsByProject.get(projectId);
    if (!ids) {
      return;
    }
    for (const key of ids) {
      this.collaborators.delete(key);
      const [, userId] = key.split("::");
      if (userId) {
        const byUser = this.collaboratorIdsByUser.get(userId);
        if (byUser) {
          byUser.delete(key);
          if (byUser.size === 0) {
            this.collaboratorIdsByUser.delete(userId);
          }
        }
      }
    }
    this.collaboratorIdsByProject.delete(projectId);
  }
}

export class InMemoryProjectInvitationStore implements ProjectInvitationStore {
  private readonly invitationsById = new Map<string, ProjectInvitation>();
  private readonly invitationsByToken = new Map<string, string>();
  private readonly invitationsByEmail = new Map<string, string>();

  private emailKey(email: string, projectId: string): string {
    return `${email.trim().toLowerCase()}::${projectId}`;
  }

  async create(
    input: CreateProjectInvitationInput
  ): Promise<ProjectInvitation> {
    const email = input.email.trim().toLowerCase();
    const now = new Date().toISOString();
    const invitation: ProjectInvitation = {
      id: userNanoid(),
      email,
      projectId: input.projectId,
      role: input.role,
      tokenHash: input.tokenHash,
      invitedBy: input.invitedBy ?? null,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
      acceptedAt: null,
      revokedAt: null,
    };

    this.invitationsById.set(invitation.id, invitation);
    this.invitationsByToken.set(invitation.tokenHash, invitation.id);
    this.invitationsByEmail.set(
      this.emailKey(email, input.projectId),
      invitation.id
    );
    return cloneProjectInvitation(invitation);
  }

  async get(id: string): Promise<ProjectInvitation | undefined> {
    const invitation = this.invitationsById.get(id);
    return invitation ? cloneProjectInvitation(invitation) : undefined;
  }

  async findByTokenHash(
    tokenHash: string
  ): Promise<ProjectInvitation | undefined> {
    const id = this.invitationsByToken.get(tokenHash);
    if (!id) {
      return undefined;
    }
    return this.get(id);
  }

  async findActiveByEmail(
    email: string,
    projectId: string
  ): Promise<ProjectInvitation | undefined> {
    const id = this.invitationsByEmail.get(this.emailKey(email, projectId));
    if (!id) {
      return undefined;
    }
    const invitation = this.invitationsById.get(id);
    if (!invitation) {
      return undefined;
    }
    if (invitation.acceptedAt || invitation.revokedAt) {
      return undefined;
    }
    return cloneProjectInvitation(invitation);
  }

  async list(): Promise<ProjectInvitation[]> {
    return Array.from(this.invitationsById.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(cloneProjectInvitation);
  }

  async listByProject(projectId: string): Promise<ProjectInvitation[]> {
    return Array.from(this.invitationsById.values())
      .filter((invitation) => invitation.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(cloneProjectInvitation);
  }

  async markAccepted(id: string): Promise<ProjectInvitation | undefined> {
    const invitation = this.invitationsById.get(id);
    if (!invitation) {
      return undefined;
    }
    const now = new Date().toISOString();
    invitation.acceptedAt = now;
    invitation.updatedAt = now;
    return cloneProjectInvitation(invitation);
  }

  async revoke(id: string): Promise<ProjectInvitation | undefined> {
    const invitation = this.invitationsById.get(id);
    if (!invitation) {
      return undefined;
    }
    const now = new Date().toISOString();
    invitation.revokedAt = now;
    invitation.updatedAt = now;
    return cloneProjectInvitation(invitation);
  }
}
