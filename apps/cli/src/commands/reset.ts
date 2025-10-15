import type { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { randomBytes } from "node:crypto";
import chalk from "chalk";
import { hashPassword } from "@nodebooks/server/auth/password";
import {
  CliConfigSchema,
  buildCliEnvironment,
  loadCliConfig,
  saveCliConfig,
  syncCliConfigToSettings,
} from "@nodebooks/config/cli";
import {
  createNotebookContext,
  disposeNotebookContext,
  ensureAdminUser,
} from "../admin.js";
import { promptForNewPassword } from "./password.js";

const generateRandomPassword = (length = 20): string => {
  const bytes = randomBytes(Math.ceil((length * 3) / 4));
  return bytes
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length);
};

export const registerResetCommand = (program: Command) => {
  program
    .command("reset")
    .description("Reset the admin user password")
    .action(async () => {
      const current = await loadCliConfig();
      if (!current) {
        console.error(
          chalk.red("✖"),
          "No configuration found. Run",
          chalk.cyan("nbks config"),
          "before resetting the password."
        );
        process.exitCode = 1;
        return;
      }

      const autoPassword = await confirm({
        message: "Generate a random password?",
        default: true,
      });

      let passwordValue: string;
      let passwordHash: string;

      if (autoPassword) {
        passwordValue = generateRandomPassword();
        passwordHash = await hashPassword(passwordValue);
      } else {
        const prompted = await promptForNewPassword("Admin");
        passwordValue = prompted.password;
        passwordHash = prompted.hash;
      }

      const parsed = CliConfigSchema.parse({
        ...current,
        admin: {
          ...current.admin,
          passwordHash,
        },
      });

      const savedConfig = await saveCliConfig(parsed);

      const envOverrides = buildCliEnvironment(savedConfig);
      envOverrides.NODEBOOKS_LOG_LEVEL ??= "warn";

      const context = createNotebookContext(savedConfig, envOverrides);
      const result = await ensureAdminUser(savedConfig, context);
      await syncCliConfigToSettings(context.bundle.settings, savedConfig);
      await disposeNotebookContext(context);

      console.log(chalk.green("✔"), "Admin password reset successfully.");
      if (result.passwordChanged) {
        console.log(
          `${chalk.dim("New password")}: ${chalk.magenta(passwordValue)}`
        );
        console.log(chalk.dim("Store this password securely."));
      } else {
        console.log(chalk.dim("Admin password unchanged."));
      }
    });
};
