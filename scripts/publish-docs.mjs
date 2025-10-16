/* eslint-env node */

import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "out");
const targetDir = path.join(rootDir, "docs");
const preservedEntries = new Set(["CNAME"]);
const excludedFromCopy = new Set(["types"]);
const cnameValue = "nbks.dev";
const noJekyllFile = ".nojekyll";

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function ensureTargetReady() {
  await mkdir(targetDir, { recursive: true });
  const cnamePath = path.join(targetDir, "CNAME");
  if (!(await pathExists(cnamePath))) {
    await writeFile(cnamePath, `${cnameValue}\n`, "utf8");
  }
  const entries = await readdir(targetDir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (preservedEntries.has(entry.name)) {
        return;
      }
      await rm(path.join(targetDir, entry.name), { recursive: true, force: true });
    }),
  );
}

async function copySourceToTarget() {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (excludedFromCopy.has(entry.name)) {
        return;
      }
      const from = path.join(sourceDir, entry.name);
      const to = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await mkdir(to, { recursive: true });
        await cp(from, to, { recursive: true, force: true });
      } else {
        await cp(from, to, { force: true });
      }
    }),
  );
}

async function main() {
  if (!(await pathExists(sourceDir))) {
    throw new Error(`Source directory "${sourceDir}" was not found. Run "next build" first.`);
  }

  const noJekyllSourcePath = path.join(sourceDir, noJekyllFile);
  await writeFile(noJekyllSourcePath, "");

  await ensureTargetReady();
  await copySourceToTarget();

  const noJekyllTargetPath = path.join(targetDir, noJekyllFile);
  await writeFile(noJekyllTargetPath, "");

  await rm(sourceDir, { recursive: true, force: true });

  console.log(
    `Copied static export to "${targetDir}" (preserved CNAME) and removed temporary "${sourceDir}" folder.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
