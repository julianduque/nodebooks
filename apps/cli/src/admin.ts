import { loadServerConfig } from "@nodebooks/config";
import type { CliConfig } from "@nodebooks/config/cli";
import { AuthService } from "@nodebooks/server/auth/service";
import {
  createNotebookStore,
  type NotebookStoreResult,
} from "@nodebooks/server/store/factory";

export type EnvironmentMap = Record<string, string>;

export interface AdminSyncResult {
  created: boolean;
  updated: boolean;
  passwordChanged: boolean;
}

export interface NotebookContext {
  bundle: NotebookStoreResult;
  authService: AuthService;
}

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const createNotebookContext = (
  config: CliConfig,
  env: EnvironmentMap
): NotebookContext => {
  const mergedEnv = { ...process.env, ...env };
  const serverConfig = loadServerConfig(mergedEnv);
  const bundle = createNotebookStore(
    {
      driver: config.persistence.driver,
      sqlitePath: config.persistence.sqlitePath,
      databaseUrl: config.persistence.databaseUrl,
    },
    serverConfig
  );

  const authService = new AuthService(
    bundle.users,
    bundle.authSessions,
    bundle.invitations,
    bundle.collaborators,
    bundle.projects,
    bundle.projectInvitations,
    bundle.projectCollaborators,
    bundle.store
  );

  return { bundle, authService };
};

export const ensureAdminUser = async (
  config: CliConfig,
  context: NotebookContext
): Promise<AdminSyncResult> => {
  const { authService, bundle } = context;
  const email = normalizeEmail(config.admin.email);
  const existing = await authService.findUserByEmail(email);

  if (!existing) {
    await bundle.users.create({
      email,
      name: config.admin.name,
      passwordHash: config.admin.passwordHash,
      role: "admin",
    });
    return { created: true, updated: false, passwordChanged: true };
  }

  const userRecord = await bundle.users.get(existing.id);
  if (!userRecord) {
    await bundle.users.create({
      email,
      name: config.admin.name,
      passwordHash: config.admin.passwordHash,
      role: "admin",
    });
    return { created: true, updated: false, passwordChanged: true };
  }

  const updates: {
    name?: string | null;
    passwordHash?: string;
    role?: "admin" | "editor" | "viewer";
  } = {};
  let passwordChanged = false;

  if ((userRecord.name ?? "") !== config.admin.name) {
    updates.name = config.admin.name;
  }
  if (userRecord.role !== "admin") {
    updates.role = "admin";
  }
  if (userRecord.passwordHash !== config.admin.passwordHash) {
    updates.passwordHash = config.admin.passwordHash;
    passwordChanged = true;
  }

  if (Object.keys(updates).length === 0) {
    return { created: false, updated: false, passwordChanged: false };
  }

  await bundle.users.update(userRecord.id, updates);
  if (passwordChanged) {
    await authService.logoutAll(userRecord.id);
  }
  return { created: false, updated: true, passwordChanged };
};

export const disposeNotebookContext = async (
  context: NotebookContext
): Promise<void> => {
  const maybeClosable = context.bundle.store as {
    close?: () => Promise<void> | void;
  };
  if (typeof maybeClosable.close === "function") {
    await maybeClosable.close();
  }
};
