import type { Command } from "commander";
import spawn from "cross-spawn";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { loadServerConfig } from "@nodebooks/config";
import {
  buildCliEnvironment,
  getCliConfigFilePath,
  loadCliConfig,
  prepareCliConfig,
  saveCliConfig,
  syncCliConfigToSettings,
} from "@nodebooks/config/cli";
import {
  createNotebookContext,
  disposeNotebookContext,
  ensureAdminUser,
} from "../admin.js";

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const workspaceServerEntry = async (): Promise<string | null> => {
  const workspaceRoot = path.resolve(__dirname, "..", "..", "..", "..");
  const distEntry = path.join(
    workspaceRoot,
    "apps",
    "backend",
    "dist",
    "index.js"
  );
  try {
    await fs.access(distEntry);
    return distEntry;
  } catch {
    return null;
  }
};

const resolveServerEntry = async (): Promise<string> => {
  try {
    return require.resolve("@nodebooks/server");
  } catch {
    const workspaceEntry = await workspaceServerEntry();
    if (workspaceEntry) {
      return workspaceEntry;
    }
    throw new Error(
      "Could not resolve @nodebooks/server entry point. Ensure the server bundle (apps/backend/dist) is built before running nbks."
    );
  }
};

export const startServer = async () => {
  const existing = await loadCliConfig();
  if (!existing) {
    console.error(
      chalk.red("✖"),
      "Configuration not found. Run",
      chalk.cyan("nbks config"),
      "to set up NodeBooks."
    );
    process.exitCode = 1;
    return;
  }

  const prepared = await prepareCliConfig(existing);
  if (prepared.changed) {
    await saveCliConfig(prepared.config);
  }

  const envOverrides = buildCliEnvironment(prepared.config);
  envOverrides.NODE_ENV = "production";
  if (!envOverrides.NODEBOOKS_LOG_LEVEL) {
    envOverrides.NODEBOOKS_LOG_LEVEL = "warn";
  }
  if (!envOverrides.EMBED_NEXT) {
    envOverrides.EMBED_NEXT = "true";
  }
  if (!envOverrides.NEXT_KEEP_CLIENT_CWD) {
    envOverrides.NEXT_KEEP_CLIENT_CWD = "false";
  }

  const context = createNotebookContext(prepared.config, envOverrides);
  await ensureAdminUser(prepared.config, context);
  await syncCliConfigToSettings(context.bundle.settings, prepared.config);
  await disposeNotebookContext(context);

  const childEnv = {
    ...process.env,
    ...envOverrides,
  };
  const serverConfig = loadServerConfig(childEnv);
  const urlHost =
    serverConfig.host === "0.0.0.0" ? "localhost" : serverConfig.host;
  const serverUrl = `http://${urlHost}:${serverConfig.port}`;

  let serverEntry: string;
  try {
    serverEntry = await resolveServerEntry();
  } catch (error) {
    console.error(chalk.red("✖"), (error as Error).message);
    process.exitCode = 1;
    return;
  }

  const child = spawn(process.execPath, [serverEntry], {
    stdio: "inherit",
    env: childEnv,
  });

  child.on("spawn", () => {
    console.log(chalk.green("✔"), "Starting NodeBooks server...");
    console.log(
      chalk.dim("Using configuration at"),
      chalk.cyan(getCliConfigFilePath())
    );
    console.log(chalk.greenBright("➜"), "Open", chalk.cyan(serverUrl));
  });

  child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exitCode = code ?? 0;
  });

  child.on("error", (error: Error) => {
    console.error(chalk.red("✖"), "Failed to start NodeBooks server:", error);
    process.exitCode = 1;
  });

  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }
};

export const registerStartCommand = (program: Command) => {
  program
    .command("start")
    .description("Start the NodeBooks server")
    .action(async () => {
      await startServer();
    });
};
