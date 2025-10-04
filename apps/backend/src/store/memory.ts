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

  async create(input: CreateInvitationInput): Promise<Invitation> {
    const email = input.email.trim().toLowerCase();
    const now = new Date().toISOString();
    const invitation: Invitation = {
      id: userNanoid(),
      email,
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
    this.invitationsByEmail.set(email, invitation.id);
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

  async findActiveByEmail(email: string): Promise<Invitation | undefined> {
    const id = this.invitationsByEmail.get(email.trim().toLowerCase());
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
