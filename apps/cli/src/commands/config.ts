import type { Command } from "commander";
import { confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";
import {
  CliConfigSchema,
  createDefaultCliConfig,
  loadCliConfig,
  saveCliConfig,
  getCliConfigFilePath,
  getDefaultCliSqlitePath,
  buildCliEnvironment,
  syncCliConfigToSettings,
} from "@nodebooks/config/cli";
import {
  createNotebookContext,
  ensureAdminUser,
  disposeNotebookContext,
} from "../admin.js";
import { promptForNewPassword } from "./password.js";

export const registerConfigCommand = (program: Command) => {
  program
    .command("config")
    .description("Set up NodeBooks configuration")
    .action(async () => {
      const existing = await loadCliConfig();
      const baseConfig = existing ?? createDefaultCliConfig();

      const driver = await select({
        message: "Select persistence driver",
        choices: [
          { name: "SQLite (local file)", value: "sqlite" },
          { name: "Postgres (database URL)", value: "postgres" },
        ],
        default: baseConfig.persistence.driver,
      });

      let sqlitePath = baseConfig.persistence.sqlitePath;
      let databaseUrl = baseConfig.persistence.databaseUrl;

      if (driver === "sqlite") {
        sqlitePath = await input({
          message: "Path to SQLite database",
          default:
            baseConfig.persistence.sqlitePath ?? getDefaultCliSqlitePath(),
          validate: (value) =>
            value && value.trim().length > 0
              ? true
              : "SQLite path cannot be empty",
        });
        databaseUrl = undefined;
      } else {
        databaseUrl = await input({
          message: "Postgres connection string",
          default: baseConfig.persistence.databaseUrl ?? "",
          validate: (value) =>
            value && value.trim().length > 0
              ? true
              : "Database URL cannot be empty",
        });
        sqlitePath = undefined;
      }

      const theme = await select({
        message: "Preferred theme",
        choices: [
          { name: "Light", value: "light" },
          { name: "Dark", value: "dark" },
        ],
        default: baseConfig.theme,
      });

      const aiEnabled = await confirm({
        message: "Enable AI features?",
        default: baseConfig.ai.enabled,
      });

      let aiProvider = baseConfig.ai.provider;
      if (aiEnabled) {
        aiProvider = await select({
          message: "AI provider",
          choices: [
            { name: "OpenAI", value: "openai" },
            { name: "Heroku AI", value: "heroku" },
          ],
          default: baseConfig.ai.provider,
        });
      }

      let openaiModel = baseConfig.ai.openai?.model ?? "gpt-4o-mini";
      let openaiApiKey = baseConfig.ai.openai?.apiKey ?? "";
      let herokuModelId = baseConfig.ai.heroku?.modelId ?? "";
      let herokuInferenceKey = baseConfig.ai.heroku?.inferenceKey ?? "";
      let herokuInferenceUrl = baseConfig.ai.heroku?.inferenceUrl ?? "";

      if (aiEnabled && aiProvider === "openai") {
        openaiModel = await input({
          message: "OpenAI model",
          default: openaiModel,
        });
        openaiApiKey = await input({
          message: "OpenAI API key (leave blank to skip)",
          default: openaiApiKey,
        });
      }

      if (aiEnabled && aiProvider === "heroku") {
        herokuModelId = await input({
          message: "Heroku model ID",
          default: herokuModelId,
        });
        herokuInferenceKey = await input({
          message: "Heroku inference key",
          default: herokuInferenceKey,
        });
        herokuInferenceUrl = await input({
          message: "Heroku inference URL",
          default: herokuInferenceUrl,
        });
      }

      const adminEmail = await input({
        message: "Admin email",
        default: existing ? baseConfig.admin.email : "",
        validate: (value) =>
          value && value.includes("@") ? true : "Enter a valid email",
      });

      const adminName = await input({
        message: "Admin display name",
        default: existing ? baseConfig.admin.name : "",
        validate: (value) =>
          value && value.trim().length > 0 ? true : "Name cannot be empty",
      });

      let passwordHash = baseConfig.admin.passwordHash;
      let newPasswordValue: string | null = null;
      if (!existing) {
        const created = await promptForNewPassword("Admin");
        passwordHash = created.hash;
        newPasswordValue = created.password;
      } else {
        const changePassword = await confirm({
          message: "Update admin password?",
          default: false,
        });
        if (changePassword) {
          const created = await promptForNewPassword("Admin");
          passwordHash = created.hash;
          newPasswordValue = created.password;
        }
      }

      const parsed = CliConfigSchema.parse({
        persistence: {
          driver,
          sqlitePath: driver === "sqlite" ? sqlitePath : undefined,
          databaseUrl: driver === "postgres" ? databaseUrl : undefined,
        },
        theme,
        ai: {
          enabled: aiEnabled,
          provider: aiEnabled ? aiProvider : baseConfig.ai.provider,
          openai:
            aiEnabled && aiProvider === "openai"
              ? {
                  model: openaiModel || undefined,
                  apiKey: openaiApiKey || undefined,
                }
              : undefined,
          heroku:
            aiEnabled && aiProvider === "heroku"
              ? {
                  modelId: herokuModelId || undefined,
                  inferenceKey: herokuInferenceKey || undefined,
                  inferenceUrl: herokuInferenceUrl || undefined,
                }
              : undefined,
        },
        admin: {
          email: adminEmail.trim(),
          name: adminName.trim(),
          passwordHash,
        },
      });

      const savedConfig = await saveCliConfig(parsed);

      const envOverrides = buildCliEnvironment(savedConfig);
      envOverrides.NODEBOOKS_LOG_LEVEL ??= "warn";

      const context = createNotebookContext(savedConfig, envOverrides);
      await ensureAdminUser(savedConfig, context);
      await syncCliConfigToSettings(context.bundle.settings, savedConfig);
      await disposeNotebookContext(context);

      const configPath = getCliConfigFilePath();
      console.log(
        `${chalk.green("✔")} Configuration saved to ${chalk.cyan(configPath)}`
      );
      const persistenceDetails = (() => {
        if (
          savedConfig.persistence.driver === "sqlite" &&
          savedConfig.persistence.sqlitePath
        ) {
          return `${savedConfig.persistence.driver} ${chalk.dim("↦")} ${savedConfig.persistence.sqlitePath}`;
        }
        if (
          savedConfig.persistence.driver === "postgres" &&
          savedConfig.persistence.databaseUrl
        ) {
          return `${savedConfig.persistence.driver} ${chalk.dim("↦")} ${savedConfig.persistence.databaseUrl}`;
        }
        return savedConfig.persistence.driver;
      })();
      console.log(
        `${chalk.dim("Persistence")}: ${chalk.white(persistenceDetails)}`
      );
      console.log(`${chalk.dim("Theme")}: ${chalk.white(savedConfig.theme)}`);
      console.log(
        `${chalk.dim("AI")}: ${chalk.white(
          savedConfig.ai.enabled ? savedConfig.ai.provider : "disabled"
        )}`
      );
      if (newPasswordValue) {
        console.log(
          `${chalk.yellow("!")} Admin password updated. Store the new password securely.`
        );
      } else {
        console.log(`${chalk.dim("Admin password unchanged.")}`);
      }
    });
};
