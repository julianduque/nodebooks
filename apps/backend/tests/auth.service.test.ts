import { describe, expect, it } from "vitest";

import {
  InMemoryNotebookStore,
  InMemoryUserStore,
  InMemoryAuthSessionStore,
  InMemoryInvitationStore,
  InMemoryNotebookCollaboratorStore,
  InMemoryProjectStore,
  InMemoryProjectInvitationStore,
  InMemoryProjectCollaboratorStore,
} from "../src/store/memory.js";
import {
  AuthService,
  CannotRemoveLastAdminError,
  CannotRemoveSelfError,
  InvalidCurrentPasswordError,
} from "../src/auth/service.js";
import { hashSessionToken } from "../src/auth/session.js";

const createAuthHarness = async () => {
  const notebooks = new InMemoryNotebookStore();
  const users = new InMemoryUserStore();
  const sessions = new InMemoryAuthSessionStore();
  const invitations = new InMemoryInvitationStore();
  const collaborators = new InMemoryNotebookCollaboratorStore();
  const projects = new InMemoryProjectStore();
  const projectInvitations = new InMemoryProjectInvitationStore();
  const projectCollaborators = new InMemoryProjectCollaboratorStore();

  const service = new AuthService(
    users,
    sessions,
    invitations,
    collaborators,
    projects,
    projectInvitations,
    projectCollaborators,
    notebooks
  );

  return {
    service,
    users,
    sessions,
    collaborators,
    projects,
    projectCollaborators,
    notebooks,
  } as const;
};

describe("AuthService.updatePassword", () => {
  it("rotates sessions and updates credentials", async () => {
    const { service, sessions } = await createAuthHarness();

    const created = await service.createUser({
      email: "user@example.com",
      password: "Password123!",
      name: "Example User",
      autoLogin: false,
    });

    const originalSession = await service.startSession(created.user.id);
    const originalTokenHash = hashSessionToken(originalSession.token);

    const result = await service.updatePassword({
      userId: created.user.id,
      currentPassword: "Password123!",
      newPassword: "NewPassword456!",
    });

    expect(result.user.id).toBe(created.user.id);
    expect(result.token).toBeTruthy();
    expect(result.session.revokedAt).toBeNull();

    const revoked = await sessions.findByTokenHash(originalTokenHash);
    expect(revoked?.revokedAt).not.toBeNull();

    await expect(
      service.authenticate("user@example.com", "Password123!")
    ).rejects.toThrowError("Invalid credentials");

    const newLogin = await service.authenticate(
      "user@example.com",
      "NewPassword456!"
    );
    expect(newLogin.user.id).toBe(created.user.id);
  });

  it("rejects incorrect current passwords", async () => {
    const { service } = await createAuthHarness();
    const created = await service.createUser({
      email: "user@example.com",
      password: "Password123!",
      name: "Example User",
      autoLogin: false,
    });

    await expect(
      service.updatePassword({
        userId: created.user.id,
        currentPassword: "WrongPassword",
        newPassword: "Whatever123!",
      })
    ).rejects.toBeInstanceOf(InvalidCurrentPasswordError);
  });

  it("rejects reusing the same password", async () => {
    const { service } = await createAuthHarness();
    const created = await service.createUser({
      email: "user@example.com",
      password: "Password123!",
      name: "Example User",
      autoLogin: false,
    });

    await expect(
      service.updatePassword({
        userId: created.user.id,
        currentPassword: "Password123!",
        newPassword: "Password123!",
      })
    ).rejects.toThrowError("New password must be different");
  });
});

describe("AuthService.removeUser", () => {
  it("removes collaborator access and revokes user sessions", async () => {
    const {
      service,
      sessions,
      collaborators,
      projects,
      projectCollaborators,
      notebooks,
      users,
    } = await createAuthHarness();

    const admin = await service.createUser({
      email: "admin@example.com",
      password: "AdminPass123!",
      name: "Admin",
      role: "admin",
      autoLogin: false,
    });

    const member = await service.createUser({
      email: "member@example.com",
      password: "MemberPass123!",
      name: "Member",
      role: "editor",
      autoLogin: false,
    });

    const notebook = (await notebooks.all())[0]!;
    await collaborators.upsert({
      notebookId: notebook.id,
      userId: member.user.id,
      role: "editor",
    });

    const project = await projects.create({ name: "Project" });
    await projectCollaborators.upsert({
      projectId: project.id,
      userId: member.user.id,
      role: "editor",
    });

    const session = await service.startSession(member.user.id);
    const sessionHash = hashSessionToken(session.token);

    await service.removeUser(admin.user.id, member.user.id);

    expect(await users.get(member.user.id)).toBeUndefined();

    const revoked = await sessions.findByTokenHash(sessionHash);
    expect(revoked?.revokedAt).not.toBeNull();

    expect(await collaborators.listForUser(member.user.id)).toHaveLength(0);
    expect(
      await projectCollaborators.listProjectIdsForUser(member.user.id)
    ).toHaveLength(0);
  });

  it("prevents removing the current user", async () => {
    const { service } = await createAuthHarness();
    const admin = await service.createUser({
      email: "admin@example.com",
      password: "AdminPass123!",
      name: "Admin",
      role: "admin",
      autoLogin: false,
    });

    await expect(
      service.removeUser(admin.user.id, admin.user.id)
    ).rejects.toBeInstanceOf(CannotRemoveSelfError);
  });

  it("prevents removing the last admin user", async () => {
    const { service } = await createAuthHarness();

    const admin = await service.createUser({
      email: "admin@example.com",
      password: "AdminPass123!",
      name: "Admin",
      role: "admin",
      autoLogin: false,
    });

    const editor = await service.createUser({
      email: "editor@example.com",
      password: "EditorPass123!",
      name: "Editor",
      role: "editor",
      autoLogin: false,
    });

    await expect(
      service.removeUser(editor.user.id, admin.user.id)
    ).rejects.toBeInstanceOf(CannotRemoveLastAdminError);
  });

  it("allows removing an admin when another admin remains", async () => {
    const { service, users } = await createAuthHarness();

    const primaryAdmin = await service.createUser({
      email: "primary@example.com",
      password: "AdminPass123!",
      name: "Primary Admin",
      role: "admin",
      autoLogin: false,
    });

    const secondaryAdmin = await service.createUser({
      email: "secondary@example.com",
      password: "AdminPass123!",
      name: "Secondary Admin",
      role: "admin",
      autoLogin: false,
    });

    await service.removeUser(primaryAdmin.user.id, secondaryAdmin.user.id);

    expect(await users.get(secondaryAdmin.user.id)).toBeUndefined();
  });
});
