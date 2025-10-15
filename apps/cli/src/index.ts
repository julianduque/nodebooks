#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "node:module";
import { registerConfigCommand } from "./commands/config.js";
import { registerResetCommand } from "./commands/reset.js";
import { registerStartCommand, startServer } from "./commands/start.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version?: string };

const program = new Command();

program
  .name("nbks")
  .description("NodeBooks CLI")
  .version(pkg.version ?? "0.0.0");

registerStartCommand(program);
registerConfigCommand(program);
registerResetCommand(program);

program
  .action(async () => {
    await startServer();
  })
  .allowExcessArguments(false);

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
