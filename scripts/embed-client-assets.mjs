import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const clientDir = path.join(workspaceRoot, "apps", "client");
const backendDir = path.join(workspaceRoot, "apps", "backend");
const backendClientDir = path.join(backendDir, "client");

const exists = async (target) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const run = (command, args, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(
        new Error(`${command} ${args.join(" ")} exited with code ${code}`)
      );
    });
    child.on("error", reject);
  });

const buildClientIfNeeded = async () => {
  const nextDir = path.join(clientDir, ".next");
  if (await exists(nextDir)) {
    return;
  }
  await run("pnpm", ["--filter", "@nodebooks/client", "build"], workspaceRoot);
};

const copyClientAssets = async () => {
  if (await exists(backendClientDir)) {
    await rm(backendClientDir, { recursive: true, force: true });
  }
  await mkdir(backendClientDir, { recursive: true });

  const directoriesToCopy = [
    {
      source: path.join(clientDir, ".next"),
      destination: path.join(backendClientDir, ".next"),
    },
    {
      source: path.join(clientDir, "public"),
      destination: path.join(backendClientDir, "public"),
    },
  ];

  for (const { source, destination } of directoriesToCopy) {
    if (await exists(source)) {
      await cp(source, destination, { recursive: true });
    }
  }

  const filesToCopy = ["next.config.mjs"];
  for (const file of filesToCopy) {
    const source = path.join(clientDir, file);
    const destination = path.join(backendClientDir, file);
    if (await exists(source)) {
      await cp(source, destination);
    }
  }
};

const main = async () => {
  await buildClientIfNeeded();
  await copyClientAssets();
};

await main();
