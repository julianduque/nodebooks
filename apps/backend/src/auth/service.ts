import {
  type AuthSession,
  type AuthSessionStore,
  type Invitation,
  type InvitationStore,
  type NotebookCollaborator,
  type NotebookCollaboratorStore,
  type NotebookRole,
  type SafeInvitation,
  type SafeUser,
  type User,
  type UserStore,
  type UserRole,
  type ProjectStore,
  type ProjectInvitation,
  type ProjectInvitationStore,
  type SafeProjectInvitation,
  type ProjectCollaborator,
  type ProjectCollaboratorStore,
  type ProjectRole,
  type NotebookStore,
} from "../types.js";
import type { Notebook } from "@nodebooks/notebook-schema";
import { hashPassword, verifyPassword } from "./password.js";
import {
  SESSION_COOKIE_MAX_AGE_MS,
  SESSION_COOKIE_NAME,
  createSessionToken,
  hashSessionToken,
} from "./session.js";
import {
  INVITATION_EXPIRY_MS,
  createInvitationToken,
  hashInvitationToken,
} from "./invitation.js";

export interface AuthenticatedSession {
  user: SafeUser;
  session: AuthSession;
  token: string;
}

const toSafeUser = (user: User): SafeUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export class AuthService {
  constructor(
    private readonly users: UserStore,
    private readonly sessions: AuthSessionStore,
    private readonly invitations: InvitationStore,
    private readonly collaborators: NotebookCollaboratorStore,
    private readonly projects: ProjectStore,
    private readonly projectInvitations: ProjectInvitationStore,
    private readonly projectCollaborators: ProjectCollaboratorStore,
    private readonly notebooks: NotebookStore
  ) {}

  async hasUsers(): Promise<boolean> {
    return (await this.users.count()) > 0;
  }

  async listUsers(): Promise<SafeUser[]> {
    const rows = await this.users.list();
    return rows.map(toSafeUser);
  }

  async findUserByEmail(email: string): Promise<SafeUser | null> {
    const user = await this.users.findByEmail(normalizeEmail(email));
    return user ? toSafeUser(user) : null;
  }

  async createUser(input: {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
    autoLogin?: boolean;
  }): Promise<
    | AuthenticatedSession
    | { user: SafeUser; token?: undefined; session?: undefined }
  > {
    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);
    const user = await this.users.create({
      email,
      passwordHash,
      name: input.name.trim(),
      role: input.role,
    });
    const safeUser = toSafeUser(user);
    if (!input.autoLogin) {
      return { user: safeUser };
    }
    const session = await this.startSession(user.id);
    return { user: safeUser, session: session.session, token: session.token };
  }

  private isInvitationExpired(invitation: Invitation): boolean {
    const expiresAt = Date.parse(invitation.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
  }

  private isProjectInvitationExpired(invitation: ProjectInvitation): boolean {
    const expiresAt = Date.parse(invitation.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
  }

  private toSafeInvitation(invitation: Invitation): SafeInvitation {
    const { tokenHash, ...rest } = invitation;
    void tokenHash;
    return { ...rest };
  }

  private toSafeProjectInvitation(
    invitation: ProjectInvitation
  ): SafeProjectInvitation {
    const { tokenHash, ...rest } = invitation;
    void tokenHash;
    return { ...rest };
  }

  private async augmentInvitation(
    invitation: Invitation
  ): Promise<SafeInvitation & { invitedByUser?: SafeUser | null }> {
    const base = this.toSafeInvitation(invitation);
    if (!invitation.invitedBy) {
      return base;
    }
    const inviter = await this.users.get(invitation.invitedBy);
    if (!inviter) {
      return base;
    }
    return { ...base, invitedByUser: toSafeUser(inviter) };
  }

  private async augmentProjectInvitation(
    invitation: ProjectInvitation
  ): Promise<SafeProjectInvitation & { invitedByUser?: SafeUser | null }> {
    const base = this.toSafeProjectInvitation(invitation);
    if (!invitation.invitedBy) {
      return base;
    }
    const inviter = await this.users.get(invitation.invitedBy);
    if (!inviter) {
      return base;
    }
    return { ...base, invitedByUser: toSafeUser(inviter) };
  }

  private async findActiveInvitationByToken(
    token: string
  ): Promise<
    | { type: "notebook"; invitation: Invitation }
    | { type: "project"; invitation: ProjectInvitation }
    | null
  > {
    const hashed = hashInvitationToken(token);
    const notebookInvitation = await this.invitations.findByTokenHash(hashed);
    if (notebookInvitation) {
      if (notebookInvitation.revokedAt || notebookInvitation.acceptedAt) {
        return null;
      }
      if (this.isInvitationExpired(notebookInvitation)) {
        await this.invitations.revoke(notebookInvitation.id);
        return null;
      }
      return { type: "notebook", invitation: notebookInvitation };
    }

    const projectInvitation =
      await this.projectInvitations.findByTokenHash(hashed);
    if (!projectInvitation) {
      return null;
    }
    if (projectInvitation.revokedAt || projectInvitation.acceptedAt) {
      return null;
    }
    if (this.isProjectInvitationExpired(projectInvitation)) {
      await this.projectInvitations.revoke(projectInvitation.id);
      return null;
    }
    return { type: "project", invitation: projectInvitation };
  }

  async inviteToNotebook(input: {
    email: string;
    notebookId: string;
    role?: NotebookRole;
    invitedBy?: string | null;
    expiresAt?: Date;
  }): Promise<{
    invitation: SafeInvitation & { invitedByUser?: SafeUser | null };
    token: string;
  }> {
    const email = normalizeEmail(input.email);
    const existingUser = await this.users.findByEmail(email);
    if (existingUser) {
      throw new Error("User with that email already exists");
    }

    const active = await this.invitations.findActiveByEmail(
      email,
      input.notebookId
    );
    if (active) {
      await this.invitations.revoke(active.id);
    }

    const token = createInvitationToken();
    const hashedToken = hashInvitationToken(token);
    const expiresAt = input.expiresAt
      ? input.expiresAt.toISOString()
      : new Date(Date.now() + INVITATION_EXPIRY_MS).toISOString();
    const invitation = await this.invitations.create({
      email,
      notebookId: input.notebookId,
      role: input.role ?? "editor",
      tokenHash: hashedToken,
      invitedBy: input.invitedBy ?? null,
      expiresAt,
    });
    const summary = await this.augmentInvitation(invitation);
    return { invitation: summary, token };
  }

  async listNotebookInvitations(
    notebookId: string
  ): Promise<(SafeInvitation & { invitedByUser?: SafeUser | null })[]> {
    const invitations = await this.invitations.listByNotebook(notebookId);
    return Promise.all(invitations.map((inv) => this.augmentInvitation(inv)));
  }

  private async augmentCollaborator(
    collaborator: NotebookCollaborator
  ): Promise<(NotebookCollaborator & { user: SafeUser }) | null> {
    const user = await this.users.get(collaborator.userId);
    if (!user) {
      return null;
    }
    return { ...collaborator, user: toSafeUser(user) };
  }

  private async augmentProjectCollaborator(
    collaborator: ProjectCollaborator
  ): Promise<(ProjectCollaborator & { user: SafeUser }) | null> {
    const user = await this.users.get(collaborator.userId);
    if (!user) {
      return null;
    }
    return { ...collaborator, user: toSafeUser(user) };
  }

  private async getNotebooksForProject(projectId: string): Promise<Notebook[]> {
    const notebooks = await this.notebooks.all();
    return notebooks.filter((notebook) => notebook.projectId === projectId);
  }

  private roleRank(role: NotebookRole | ProjectRole): number {
    return role === "editor" ? 2 : 1;
  }

  private normalizeRole(role: NotebookRole | ProjectRole): NotebookRole {
    return role === "editor" ? "editor" : "viewer";
  }

  private maxRole(a: NotebookRole, b: ProjectRole): NotebookRole {
    return this.roleRank(a) >= this.roleRank(b) ? a : this.normalizeRole(b);
  }

  private async applyProjectRoleToNotebooks(
    userId: string,
    projectId: string,
    role: ProjectRole
  ) {
    const notebooks = await this.getNotebooksForProject(projectId);
    for (const notebook of notebooks) {
      const existing = await this.collaborators.get(notebook.id, userId);
      if (existing) {
        const desired = this.maxRole(existing.role, role);
        if (existing.role !== desired) {
          await this.collaborators.updateRole(notebook.id, userId, desired);
        }
      } else {
        await this.collaborators.upsert({
          notebookId: notebook.id,
          userId,
          role: this.normalizeRole(role),
        });
      }
    }
  }

  private async removeProjectRoleFromNotebooks(
    userId: string,
    projectId: string
  ) {
    const notebooks = await this.getNotebooksForProject(projectId);
    for (const notebook of notebooks) {
      await this.collaborators.remove(notebook.id, userId);
    }
  }

  async listNotebookCollaborators(
    notebookId: string
  ): Promise<(NotebookCollaborator & { user: SafeUser })[]> {
    const collaborators = await this.collaborators.listByNotebook(notebookId);
    const summaries = await Promise.all(
      collaborators.map((collaborator) =>
        this.augmentCollaborator(collaborator)
      )
    );
    return summaries.filter(
      (summary): summary is NotebookCollaborator & { user: SafeUser } =>
        summary !== null
    );
  }

  async grantNotebookAccess(input: {
    notebookId: string;
    userId: string;
    role: NotebookRole;
  }): Promise<(NotebookCollaborator & { user: SafeUser }) | null> {
    const collaborator = await this.collaborators.upsert(input);
    return this.augmentCollaborator(collaborator);
  }

  async updateNotebookCollaboratorRole(input: {
    notebookId: string;
    userId: string;
    role: NotebookRole;
  }): Promise<(NotebookCollaborator & { user: SafeUser }) | null> {
    const updated = await this.collaborators.updateRole(
      input.notebookId,
      input.userId,
      input.role
    );
    if (!updated) {
      return null;
    }
    return this.augmentCollaborator(updated);
  }

  async removeNotebookCollaborator(
    notebookId: string,
    userId: string
  ): Promise<boolean> {
    return this.collaborators.remove(notebookId, userId);
  }

  async listProjectCollaborators(
    projectId: string
  ): Promise<(ProjectCollaborator & { user: SafeUser })[]> {
    const collaborators =
      await this.projectCollaborators.listByProject(projectId);
    const summaries = await Promise.all(
      collaborators.map((collaborator) =>
        this.augmentProjectCollaborator(collaborator)
      )
    );
    return summaries.filter(
      (summary): summary is ProjectCollaborator & { user: SafeUser } =>
        summary !== null
    );
  }

  async listProjectInvitations(
    projectId: string
  ): Promise<(SafeProjectInvitation & { invitedByUser?: SafeUser | null })[]> {
    const invitations = await this.projectInvitations.listByProject(projectId);
    return Promise.all(
      invitations.map((inv) => this.augmentProjectInvitation(inv))
    );
  }

  async inviteToProject(input: {
    email: string;
    projectId: string;
    role?: ProjectRole;
    invitedBy?: string | null;
    expiresAt?: Date;
  }): Promise<{
    invitation: SafeProjectInvitation & { invitedByUser?: SafeUser | null };
    token: string;
  }> {
    const email = normalizeEmail(input.email);
    const active = await this.projectInvitations.findActiveByEmail(
      email,
      input.projectId
    );
    if (active) {
      await this.projectInvitations.revoke(active.id);
    }

    const token = createInvitationToken();
    const hashedToken = hashInvitationToken(token);
    const expiresAt = input.expiresAt
      ? input.expiresAt.toISOString()
      : new Date(Date.now() + INVITATION_EXPIRY_MS).toISOString();
    const invitation = await this.projectInvitations.create({
      email,
      projectId: input.projectId,
      role: input.role ?? "editor",
      tokenHash: hashedToken,
      invitedBy: input.invitedBy ?? null,
      expiresAt,
    });
    const summary = await this.augmentProjectInvitation(invitation);
    return { invitation: summary, token };
  }

  async grantProjectAccess(input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
  }): Promise<(ProjectCollaborator & { user: SafeUser }) | null> {
    const collaborator = await this.projectCollaborators.upsert(input);
    await this.applyProjectRoleToNotebooks(
      input.userId,
      input.projectId,
      input.role
    );
    return this.augmentProjectCollaborator(collaborator);
  }

  async updateProjectCollaboratorRole(input: {
    projectId: string;
    userId: string;
    role: ProjectRole;
  }): Promise<(ProjectCollaborator & { user: SafeUser }) | null> {
    const updated = await this.projectCollaborators.updateRole(
      input.projectId,
      input.userId,
      input.role
    );
    if (!updated) {
      return null;
    }
    await this.applyProjectRoleToNotebooks(
      input.userId,
      input.projectId,
      input.role
    );
    return this.augmentProjectCollaborator(updated);
  }

  async removeProjectCollaborator(
    projectId: string,
    userId: string
  ): Promise<boolean> {
    const removed = await this.projectCollaborators.remove(projectId, userId);
    if (removed) {
      await this.removeProjectRoleFromNotebooks(userId, projectId);
    }
    return removed;
  }

  async revokeProjectInvitation(
    id: string
  ): Promise<
    (SafeProjectInvitation & { invitedByUser?: SafeUser | null }) | null
  > {
    const revoked = await this.projectInvitations.revoke(id);
    if (!revoked) {
      return null;
    }
    return this.augmentProjectInvitation(revoked);
  }

  async revokeInvitation(
    id: string
  ): Promise<(SafeInvitation & { invitedByUser?: SafeUser | null }) | null> {
    const revoked = await this.invitations.revoke(id);
    if (!revoked) {
      return null;
    }
    return this.augmentInvitation(revoked);
  }

  async inspectInvitation(token: string): Promise<
    | ({
        type: "notebook";
        notebookId: string;
      } & (SafeInvitation & { invitedByUser?: SafeUser | null }))
    | ({
        type: "project";
        projectId: string;
        projectName: string | null;
      } & (SafeProjectInvitation & { invitedByUser?: SafeUser | null }))
    | null
  > {
    const pending = await this.findActiveInvitationByToken(token);
    if (!pending) {
      return null;
    }
    if (pending.type === "notebook") {
      const summary = await this.augmentInvitation(pending.invitation);
      return {
        type: "notebook" as const,
        ...summary,
      };
    }
    const summary = await this.augmentProjectInvitation(pending.invitation);
    const project = await this.projects.get(pending.invitation.projectId);
    return {
      type: "project" as const,
      projectName: project?.name ?? null,
      ...summary,
    };
  }

  async completeInvitation(input: {
    token: string;
    password: string;
    name: string;
    autoLogin?: boolean;
  }): Promise<
    | AuthenticatedSession
    | { user: SafeUser; token?: undefined; session?: undefined }
  > {
    const pending = await this.findActiveInvitationByToken(input.token);
    if (!pending) {
      throw new Error("Invitation is no longer valid");
    }

    const passwordHash = await hashPassword(input.password);
    const baseUser = await this.users.create({
      email:
        pending.type === "notebook"
          ? pending.invitation.email
          : pending.invitation.email,
      name: input.name.trim(),
      role:
        pending.type === "notebook"
          ? pending.invitation.role
          : pending.invitation.role,
      passwordHash,
    });

    if (pending.type === "notebook") {
      await this.collaborators.upsert({
        notebookId: pending.invitation.notebookId,
        userId: baseUser.id,
        role: pending.invitation.role,
      });
      await this.invitations.markAccepted(pending.invitation.id);
    } else {
      await this.projectCollaborators.upsert({
        projectId: pending.invitation.projectId,
        userId: baseUser.id,
        role: pending.invitation.role,
      });
      await this.applyProjectRoleToNotebooks(
        baseUser.id,
        pending.invitation.projectId,
        pending.invitation.role
      );
      await this.projectInvitations.markAccepted(pending.invitation.id);
    }

    const user = pending.type === "notebook" ? baseUser : baseUser;
    const safeUser = toSafeUser(user);
    if (input.autoLogin === false) {
      return { user: safeUser };
    }
    const session = await this.startSession(user.id);
    return { user: safeUser, session: session.session, token: session.token };
  }

  async authenticate(
    email: string,
    password: string
  ): Promise<AuthenticatedSession> {
    const normalized = normalizeEmail(email);
    const user = await this.users.findByEmail(normalized);
    if (!user) {
      throw new Error("Invalid credentials");
    }
    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      throw new Error("Invalid credentials");
    }
    return this.startSession(user.id);
  }

  async startSession(userId: string): Promise<AuthenticatedSession> {
    const user = await this.users.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    const token = createSessionToken();
    const hashed = hashSessionToken(token);
    const expiresAt = new Date(
      Date.now() + SESSION_COOKIE_MAX_AGE_MS
    ).toISOString();
    const session = await this.sessions.create({
      userId,
      tokenHash: hashed,
      expiresAt,
    });
    const safeUser = toSafeUser(user);
    return { user: safeUser, session, token };
  }

  async validateSession(
    token: string | undefined
  ): Promise<{ user: SafeUser; session: AuthSession } | null> {
    if (!token) {
      return null;
    }
    const hashed = hashSessionToken(token);
    const session = await this.sessions.findByTokenHash(hashed);
    if (!session) {
      return null;
    }
    if (session.revokedAt) {
      return null;
    }
    const expiresAt = Date.parse(session.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      await this.sessions.revoke(session.id);
      return null;
    }
    const user = await this.users.get(session.userId);
    if (!user) {
      await this.sessions.revoke(session.id);
      return null;
    }
    await this.sessions.touch(session.id);
    return { user: toSafeUser(user), session };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.sessions.revokeForUser(userId);
  }

  get sessionCookieName(): string {
    return SESSION_COOKIE_NAME;
  }
}
