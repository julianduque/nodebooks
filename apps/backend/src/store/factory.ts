import {
  InMemoryAuthSessionStore,
  InMemoryInvitationStore,
  InMemoryNotebookCollaboratorStore,
  InMemoryNotebookStore,
  InMemoryProjectCollaboratorStore,
  InMemoryProjectInvitationStore,
  InMemoryProjectStore,
  InMemorySettingsStore,
  InMemoryUserStore,
} from "./memory.js";
import {
  PostgresAuthSessionStore,
  PostgresInvitationStore,
  PostgresNotebookCollaboratorStore,
  PostgresNotebookStore,
  PostgresProjectCollaboratorStore,
  PostgresProjectInvitationStore,
  PostgresProjectStore,
  PostgresSettingsStore,
  PostgresUserStore,
} from "./postgres.js";
import {
  SqliteAuthSessionStore,
  SqliteInvitationStore,
  SqliteNotebookCollaboratorStore,
  SqliteNotebookStore,
  SqliteProjectCollaboratorStore,
  SqliteProjectInvitationStore,
  SqliteProjectStore,
  SqliteSettingsStore,
  SqliteUserStore,
} from "./sqlite.js";
import type {
  AuthSessionStore,
  InvitationStore,
  NotebookCollaboratorStore,
  NotebookStore,
  ProjectCollaboratorStore,
  ProjectInvitationStore,
  ProjectStore,
  SettingsStore,
  UserStore,
} from "../types.js";
import { loadServerConfig } from "@nodebooks/config";
import type { ServerConfig } from "@nodebooks/config";

export type PersistenceDriver = "in-memory" | "sqlite" | "postgres";

export interface CreateNotebookStoreOptions {
  driver?: string;
  sqlitePath?: string;
  databaseUrl?: string;
}

export interface NotebookStoreResult {
  store: NotebookStore;
  settings: SettingsStore;
  users: UserStore;
  authSessions: AuthSessionStore;
  invitations: InvitationStore;
  collaborators: NotebookCollaboratorStore;
  projects: ProjectStore;
  projectInvitations: ProjectInvitationStore;
  projectCollaborators: ProjectCollaboratorStore;
  driver: PersistenceDriver;
}

export const resolvePersistenceDriver = (
  raw: string | undefined
): PersistenceDriver => {
  const normalized = (raw ?? "sqlite").trim().toLowerCase();
  if (normalized === "in-memory" || normalized === "memory") {
    return "in-memory";
  }
  if (normalized === "sqlite") {
    return "sqlite";
  }
  if (normalized === "postgres" || normalized === "postgresql") {
    return "postgres";
  }
  throw new Error(
    `Unsupported NODEBOOKS_PERSISTENCE value "${raw}". Use "in-memory", "sqlite", or "postgres".`
  );
};

export const createNotebookStore = (
  options: CreateNotebookStoreOptions = {},
  config: ServerConfig = loadServerConfig()
): NotebookStoreResult => {
  const driver = resolvePersistenceDriver(
    options.driver ?? config.persistence.driver
  );
  switch (driver) {
    case "in-memory":
      return {
        store: new InMemoryNotebookStore(),
        settings: new InMemorySettingsStore(),
        users: new InMemoryUserStore(),
        authSessions: new InMemoryAuthSessionStore(),
        invitations: new InMemoryInvitationStore(),
        collaborators: new InMemoryNotebookCollaboratorStore(),
        projects: new InMemoryProjectStore(),
        projectInvitations: new InMemoryProjectInvitationStore(),
        projectCollaborators: new InMemoryProjectCollaboratorStore(),
        driver,
      };
    case "sqlite": {
      const sqliteStore = new SqliteNotebookStore({
        databaseFile: options.sqlitePath ?? config.persistence.sqlitePath,
      });
      return {
        store: sqliteStore,
        settings: new SqliteSettingsStore(sqliteStore),
        users: new SqliteUserStore(sqliteStore),
        authSessions: new SqliteAuthSessionStore(sqliteStore),
        invitations: new SqliteInvitationStore(sqliteStore),
        collaborators: new SqliteNotebookCollaboratorStore(sqliteStore),
        projects: new SqliteProjectStore(sqliteStore),
        projectInvitations: new SqliteProjectInvitationStore(sqliteStore),
        projectCollaborators: new SqliteProjectCollaboratorStore(sqliteStore),
        driver,
      };
    }
    case "postgres": {
      const postgresStore = new PostgresNotebookStore({
        connectionString: options.databaseUrl ?? config.persistence.databaseUrl,
      });
      return {
        store: postgresStore,
        settings: new PostgresSettingsStore(postgresStore),
        users: new PostgresUserStore(postgresStore),
        authSessions: new PostgresAuthSessionStore(postgresStore),
        invitations: new PostgresInvitationStore(postgresStore),
        collaborators: new PostgresNotebookCollaboratorStore(postgresStore),
        projects: new PostgresProjectStore(postgresStore),
        projectInvitations: new PostgresProjectInvitationStore(postgresStore),
        projectCollaborators: new PostgresProjectCollaboratorStore(
          postgresStore
        ),
        driver,
      };
    }
  }
};
