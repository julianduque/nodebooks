import {
  type AuthSession,
  type AuthSessionStore,
  type Invitation,
  type InvitationStore,
  type SafeInvitation,
  type SafeUser,
  type User,
  type UserStore,
  type UserRole,
} from "../types.js";
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
    private readonly invitations: InvitationStore
  ) {}

  async hasUsers(): Promise<boolean> {
    return (await this.users.count()) > 0;
  }

  async listUsers(): Promise<SafeUser[]> {
    const rows = await this.users.list();
    return rows.map(toSafeUser);
  }

  async createUser(input: {
    email: string;
    password: string;
    name?: string | null;
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
      name: input.name,
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

  private toSafeInvitation(invitation: Invitation): SafeInvitation {
    const { tokenHash: _tokenHash, ...rest } = invitation;
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

  private async findActiveInvitationByToken(
    token: string
  ): Promise<Invitation | null> {
    const hashed = hashInvitationToken(token);
    const invitation = await this.invitations.findByTokenHash(hashed);
    if (!invitation) {
      return null;
    }
    if (invitation.revokedAt || invitation.acceptedAt) {
      return null;
    }
    if (this.isInvitationExpired(invitation)) {
      await this.invitations.revoke(invitation.id);
      return null;
    }
    return invitation;
  }

  async inviteUser(input: {
    email: string;
    role?: UserRole;
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

    const active = await this.invitations.findActiveByEmail(email);
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
      role: input.role ?? "editor",
      tokenHash: hashedToken,
      invitedBy: input.invitedBy ?? null,
      expiresAt,
    });
    const summary = await this.augmentInvitation(invitation);
    return { invitation: summary, token };
  }

  async listInvitations(): Promise<
    (SafeInvitation & { invitedByUser?: SafeUser | null })[]
  > {
    const invitations = await this.invitations.list();
    return Promise.all(invitations.map((inv) => this.augmentInvitation(inv)));
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

  async inspectInvitation(
    token: string
  ): Promise<(SafeInvitation & { invitedByUser?: SafeUser | null }) | null> {
    const invitation = await this.findActiveInvitationByToken(token);
    if (!invitation) {
      return null;
    }
    return this.augmentInvitation(invitation);
  }

  async completeInvitation(input: {
    token: string;
    password: string;
    name?: string | null;
    autoLogin?: boolean;
  }): Promise<
    | AuthenticatedSession
    | { user: SafeUser; token?: undefined; session?: undefined }
  > {
    const invitation = await this.findActiveInvitationByToken(input.token);
    if (!invitation) {
      throw new Error("Invitation is no longer valid");
    }

    const passwordHash = await hashPassword(input.password);
    const user = await this.users.create({
      email: invitation.email,
      name: input.name,
      role: invitation.role,
      passwordHash,
    });
    await this.invitations.markAccepted(invitation.id);
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
