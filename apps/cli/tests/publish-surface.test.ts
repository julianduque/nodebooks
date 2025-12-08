import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..", "..", "..");
const packagesRoot = path.join(repoRoot, "packages");

type PackageJson = {
  name?: string;
  files?: string[];
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, unknown>;
};

describe("package publish surface", () => {
  const packageDirs = readdirSync(packagesRoot, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory()
  );

  for (const dir of packageDirs) {
    const pkgJsonPath = path.join(packagesRoot, dir.name, "package.json");
    let pkgJson: PackageJson;

    try {
      pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    } catch {
      // Skip non-package folders (unlikely in packages/).
      continue;
    }

    it(`${pkgJson.name ?? dir.name} exposes built artifacts`, () => {
      const files = pkgJson.files ?? [];
      expect(files.length).toBeGreaterThan(0);

      const requiredDirs = new Set<string>();
      collectEntryRoots(pkgJson.main, requiredDirs);
      collectEntryRoots(pkgJson.module, requiredDirs);
      collectEntryRoots(pkgJson.types, requiredDirs);
      collectEntryRoots(pkgJson.exports, requiredDirs);

      const normalizedFiles = new Set(
        files.map((entry) => normalizeRoot(entry))
      );

      const missingDirs = [...requiredDirs].filter(
        (dirRoot) => dirRoot !== "" && !normalizedFiles.has(dirRoot)
      );

      expect(missingDirs).toStrictEqual([]);
    });
  }
});

function collectEntryRoots(value: unknown, target: Set<string>) {
  if (!value) return;
  if (typeof value === "string") {
    const root = normalizeRoot(value);
    if (root) target.add(root);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectEntryRoots(entry, target));
    return;
  }

  if (typeof value === "object") {
    Object.values(value).forEach((entry) => collectEntryRoots(entry, target));
  }
}

function normalizeRoot(entry: string): string {
  if (entry.endsWith("package.json")) return "";
  const trimmed = entry.replace(/^\.?\//, "");
  const [root] = trimmed.split("/");
  return root ?? "";
}
