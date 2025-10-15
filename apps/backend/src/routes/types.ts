import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const { uiHelpersModuleDts } = await import(
  "@nodebooks/ui/runtime/ui-helpers-dts"
);

const SPEC_RE = /^[A-Za-z0-9@/_\-.~%:]+$/;
const JS_LIKE_RE = /\.(?:c|m)?(?:j|t)sx?$/i;
const DEFAULT_RUNTIME_WORKSPACE_ROOT = path.join(
  os.tmpdir(),
  "nodebooks-runtime"
);
const RUNTIME_WORKSPACE_ROOT = path.resolve(DEFAULT_RUNTIME_WORKSPACE_ROOT);

const SpecParam = z.object({ spec: z.string().min(1).regex(SPEC_RE) });
const QueryParam = z.object({ notebookId: z.string().min(1).optional() });

async function fetchJson<T = unknown>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const toTypesPackage = (name: string) => {
  // @scope/pkg -> @types/scope__pkg
  if (name.startsWith("@")) {
    const [scope, pkg] = name.replace(/^@/, "").split("/");
    return `@types/${scope}__${pkg}`;
  }
  return `@types/${name}`;
};

// basic runtime type guards
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";

type ParsedSpec = {
  packageName: string;
  subpath: string | null;
  alias?: string | null;
};

const parsePackageSpec = (raw: string): ParsedSpec => {
  if (raw.startsWith("node:")) {
    const subPath = raw.slice(5);
    const normalized = subPath.replace(/^\/+/, "");
    return {
      packageName: "@types/node",
      subpath: normalized || null,
      alias: raw,
    };
  }
  if (raw.startsWith("@")) {
    const parts = raw.split("/");
    if (parts.length >= 3) {
      return {
        packageName: `${parts[0]}/${parts[1]}`,
        subpath: parts.slice(2).join("/"),
        alias: null,
      };
    }
    return { packageName: raw, subpath: null, alias: null };
  }
  const parts = raw.split("/");
  if (parts.length >= 2) {
    return {
      packageName: parts[0] ?? raw,
      subpath: parts.slice(1).join("/"),
      alias: null,
    };
  }
  return { packageName: raw, subpath: null, alias: null };
};

const normalizeRelativePath = (input: string) =>
  input
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");

const stripVersion = (name: string) => {
  const atIndex = name.lastIndexOf("@");
  if (atIndex <= 0) return name;
  return name.slice(0, atIndex);
};

const pathExists = async (target: string) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const readJsonFile = async (
  filePath: string
): Promise<Record<string, unknown> | null> => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const readTextFile = async (filePath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

const resolveWithinRoot = (root: string, ...segments: string[]) => {
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return target;
};

const sandboxNodeModulesPath = (notebookId: string) =>
  resolveWithinRoot(RUNTIME_WORKSPACE_ROOT, notebookId, "node_modules");

const packageDirFor = (baseDir: string, packageName: string) =>
  path.join(baseDir, ...packageName.split("/"));

const addCandidatePath = (set: Set<string>, rawPath: unknown) => {
  if (typeof rawPath !== "string") return;
  const trimmed = normalizeRelativePath(rawPath.trim());
  if (!trimmed) return;
  if (trimmed.includes("..")) return;
  if (trimmed.includes("*")) return;
  if (trimmed.endsWith(".d.ts")) {
    set.add(trimmed);
    return;
  }
  if (trimmed.endsWith(".ts")) {
    set.add(trimmed);
    const dtsPath = trimmed.replace(/\.ts$/, ".d.ts");
    set.add(dtsPath);
    return;
  }
  if (JS_LIKE_RE.test(trimmed)) {
    const dtsPath = trimmed.replace(JS_LIKE_RE, ".d.ts");
    set.add(dtsPath);
    return;
  }
  set.add(`${trimmed}.d.ts`);
};

const collectExportValue = (value: unknown, out: Set<string>) => {
  if (typeof value === "string") {
    addCandidatePath(out, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectExportValue(entry, out);
    }
    return;
  }
  if (isRecord(value)) {
    const priorityKeys = ["types", "import", "default", "require", "module"];
    for (const key of priorityKeys) {
      if (key in value) {
        collectExportValue(value[key], out);
      }
    }
  }
};

const collectFromExports = (
  exportsField: unknown,
  subpath: string | null,
  out: Set<string>
) => {
  if (!isRecord(exportsField)) return;
  const keys = new Set<string>(["."]);
  if (subpath) {
    const normalized = normalizeRelativePath(subpath);
    keys.add(`./${normalized}`);
    keys.add(`./${normalized}/index`);
  }
  for (const key of keys) {
    if (key in exportsField) {
      collectExportValue(exportsField[key], out);
    }
  }
};

const collectFromTypesVersions = (
  typesVersions: unknown,
  subpath: string | null,
  out: Set<string>
) => {
  if (!isRecord(typesVersions)) return;
  const normalizedSubpath = subpath ? normalizeRelativePath(subpath) : null;
  const substitute = (pattern: string, value: string) => {
    if (!normalizedSubpath) return value;
    if (!pattern.includes("*")) return value;
    return value.replace(/\*/g, normalizedSubpath);
  };
  for (const mapping of Object.values(typesVersions)) {
    if (!isRecord(mapping)) continue;
    const keysToCheck = new Set<string>();
    if (normalizedSubpath) {
      keysToCheck.add(`./${normalizedSubpath}`);
      keysToCheck.add(`./*`);
    }
    keysToCheck.add("*");
    keysToCheck.add(".");
    for (const target of keysToCheck) {
      if (!(target in mapping)) continue;
      const entry = mapping[target];
      if (!entry) continue;
      if (Array.isArray(entry)) {
        for (const val of entry) {
          if (typeof val === "string") {
            addCandidatePath(out, substitute(target, val));
          }
        }
      } else if (typeof entry === "string") {
        addCandidatePath(out, substitute(target, entry));
      }
    }
  }
};

const collectManifestCandidates = (
  pkgJson: Record<string, unknown> | null,
  subpath: string | null,
  out: Set<string>
) => {
  if (!pkgJson) return;
  const candidateFields = ["types", "typings"] as const;
  for (const field of candidateFields) {
    addCandidatePath(out, pkgJson[field]);
  }

  collectFromExports(pkgJson["exports"], subpath, out);
  collectFromTypesVersions(pkgJson["typesVersions"], subpath, out);
};

const buildGuessList = (subpath: string | null): string[] => {
  if (!subpath) {
    return [
      "index.d.ts",
      "dist/index.d.ts",
      "types/index.d.ts",
      "typings/index.d.ts",
    ];
  }

  const normalized = normalizeRelativePath(subpath);
  const withoutExt = normalized.replace(JS_LIKE_RE, "");
  const baseCandidates = new Set<string>([normalized]);
  if (withoutExt && withoutExt !== normalized) {
    baseCandidates.add(withoutExt);
  }
  if (normalized.endsWith("/index")) {
    baseCandidates.add(normalized.replace(/\/index$/, ""));
  }

  // Cover common build output folders so downstream re-exports resolve cleanly.
  const prefixes = [
    "",
    "dist/",
    "dist/esm/",
    "dist/cjs/",
    "esm/",
    "cjs/",
    "lib/",
    "build/",
    "src/",
    "types/",
    "typings/",
  ];

  const guesses = new Set<string>();
  const addGuessesFor = (base: string) => {
    const trimmed = normalizeRelativePath(base);
    if (!trimmed) return;
    guesses.add(`${trimmed}.d.ts`);
    guesses.add(`${trimmed}.ts`);
    if (!trimmed.endsWith("/index")) {
      guesses.add(`${trimmed}/index.d.ts`);
      guesses.add(`${trimmed}/index.ts`);
    }
  };

  for (const candidate of baseCandidates) {
    for (const prefix of prefixes) {
      addGuessesFor(`${prefix}${candidate}`);
    }
  }

  return Array.from(guesses);
};

interface ResolvedTypesModule {
  content: string;
  relativePath: string;
  packageName: string;
  source: "local" | "cdn";
}

interface ResolvedTypesBundle {
  primary: ResolvedTypesModule;
  extras: ResolvedTypesModule[];
}

const candidateScore = (value: string) => {
  const lower = value.toLowerCase();
  if (lower.endsWith("package.json")) return 0;
  if (lower.endsWith(".d.ts") || lower.endsWith(".d.cts")) return 1;
  if (lower.endsWith(".cts") || lower.endsWith(".ts")) return 2;
  if (lower.endsWith(".mjs") || lower.endsWith(".cjs")) return 4;
  if (lower.endsWith(".js")) return 5;
  return 10;
};

const prioritizeCandidates = (candidates: string[]): string[] =>
  candidates.sort((a, b) => candidateScore(a) - candidateScore(b));

const shouldIncludeModule = (filePath: string) => {
  const lower = filePath.toLowerCase();
  if (
    lower.endsWith("package.json") ||
    lower.endsWith(".d.ts") ||
    lower.endsWith(".d.cts") ||
    lower.endsWith(".d.mts") ||
    lower.endsWith(".cts") ||
    lower.endsWith(".mts")
  ) {
    return true;
  }
  return false;
};

const makeResolvedModule = (
  pkgName: string,
  relativePath: string,
  content: string,
  source: "local" | "cdn"
): ResolvedTypesModule => ({
  content,
  relativePath,
  packageName: stripVersion(pkgName),
  source,
});

const extractRelativeRefs = (content: string): string[] => {
  const refs = new Set<string>();
  const patterns = [
    /from\s+"(\.[^"\n]+)"/g,
    /from\s+'(\.[^'\n]+)'/g,
    /export\s+\*\s+from\s+"(\.[^"\n]+)"/g,
    /export\s+\*\s+from\s+'(\.[^'\n]+)'/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      refs.add(match[1]);
    }
  }
  return Array.from(refs);
};

const buildRelativeCandidates = (
  baseRelativePath: string,
  reference: string
): string[] => {
  const fromDir = path.posix.dirname(baseRelativePath);
  const resolved = normalizeRelativePath(path.posix.join(fromDir, reference));
  const set = new Set<string>();
  const base = resolved.replace(/\.(?:js|cjs|mjs)$/, "");
  set.add(resolved);
  set.add(`${resolved}.d.ts`);
  set.add(`${base}.d.ts`);
  set.add(`${base}.d.cts`);
  set.add(`${base}.d.mts`);
  set.add(`${base}.cts`);
  set.add(`${base}.mts`);
  set.add(`${base}.ts`);
  set.add(`${resolved}/index.d.ts`);
  set.add(`${base}/index.d.ts`);
  return Array.from(set)
    .map(normalizeRelativePath)
    .filter((candidate) => !!candidate);
};

const MAX_EXTRA_MODULES = 50;

const declarationVariantsFor = (relativePath: string) => {
  const base = relativePath
    .replace(/\.d\.(c|m)?ts$/, "")
    .replace(/\.(c|m)?js$/, "");
  return [
    `${base}.d.ts`,
    `${base}.d.cts`,
    `${base}.d.mts`,
    `${base}.cts`,
    `${base}.mts`,
    `${base}.ts`,
  ].map(normalizeRelativePath);
};

const collectRelativeModules = async (
  packageName: string,
  baseRelativePath: string,
  content: string,
  fetcher: (candidate: string) => Promise<string | null>,
  source: "local" | "cdn"
): Promise<ResolvedTypesModule[]> => {
  const extras: ResolvedTypesModule[] = [];
  const seen = new Set([normalizeRelativePath(baseRelativePath)]);
  const refs = extractRelativeRefs(content);
  for (const ref of refs) {
    const candidates = prioritizeCandidates(
      buildRelativeCandidates(baseRelativePath, ref)
    );
    let fallback: ResolvedTypesModule | null = null;
    for (const candidate of candidates) {
      const normalized = normalizeRelativePath(candidate);
      if (seen.has(normalized)) {
        continue;
      }
      const fetched = await fetcher(normalized);
      if (!fetched) continue;
      if (shouldIncludeModule(normalized)) {
        seen.add(normalized);
        extras.push(
          makeResolvedModule(packageName, normalized, fetched, source)
        );
        if (extras.length >= MAX_EXTRA_MODULES) {
          return extras;
        }
        continue;
      }
      let resolved = false;
      for (const declCandidate of declarationVariantsFor(normalized)) {
        if (!declCandidate || seen.has(declCandidate)) continue;
        const declContent = await fetcher(declCandidate);
        if (declContent) {
          seen.add(declCandidate);
          extras.push(
            makeResolvedModule(packageName, declCandidate, declContent, source)
          );
          resolved = true;
          if (extras.length >= MAX_EXTRA_MODULES) {
            return extras;
          }
          break;
        }
      }
      if (resolved) {
        continue;
      }
      if (!fallback) {
        fallback = makeResolvedModule(packageName, normalized, fetched, source);
      }
    }
    if (fallback && extras.length < MAX_EXTRA_MODULES) {
      seen.add(fallback.relativePath);
      extras.push(fallback);
    }
  }
  return extras;
};

const appendPackageJson = async (
  pkgDir: string | null,
  packageName: string,
  extras: ResolvedTypesModule[],
  existingJson: Record<string, unknown> | null
) => {
  const already = extras.some((mod) => mod.relativePath === "package.json");
  if (already) {
    return extras;
  }
  let jsonContent: string | null = null;
  if (existingJson) {
    jsonContent = JSON.stringify(existingJson, null, 2);
  } else if (pkgDir) {
    jsonContent = await readTextFile(path.join(pkgDir, "package.json"));
  }
  if (!jsonContent) {
    return extras;
  }
  return [
    ...extras,
    makeResolvedModule(
      packageName,
      "package.json",
      jsonContent,
      pkgDir ? "local" : "cdn"
    ),
  ];
};

const expandModuleAliases = (modules: ResolvedTypesModule[]) => {
  const expanded = [...modules];
  const seen = new Set(modules.map((m) => m.relativePath));
  for (const mod of modules) {
    if (!mod.relativePath.endsWith(".d.ts")) {
      continue;
    }
    const aliasTargets = [
      mod.relativePath.replace(/\.d\.ts$/, ".js"),
      mod.relativePath.replace(/\.d\.ts$/, ".mjs"),
      mod.relativePath.replace(/\.d\.ts$/, ".cjs"),
    ]
      .map(normalizeRelativePath)
      .filter((rel) => rel && rel !== mod.relativePath);

    const dtsBaseName = path.posix.basename(mod.relativePath);
    const withoutExt = normalizeRelativePath(
      path.posix.join(
        path.posix.dirname(mod.relativePath),
        dtsBaseName.replace(/\.d\.ts$/, "")
      )
    );
    if (withoutExt && !seen.has(withoutExt)) {
      seen.add(withoutExt);
      expanded.push({
        content: `export * from "./${dtsBaseName}";\nexport { default } from "./${dtsBaseName}";`,
        relativePath: withoutExt,
        packageName: mod.packageName,
        source: mod.source,
      });
    }
    for (const target of aliasTargets) {
      if (seen.has(target)) continue;
      seen.add(target);
      const aliasContent = `export * from "./${dtsBaseName}";\nexport { default } from "./${dtsBaseName}";`;
      expanded.push({
        content: aliasContent,
        relativePath: target,
        packageName: mod.packageName,
        source: mod.source,
      });
    }
  }
  return expanded;
};

const resolveTypesFromLocalPackage = async (
  modulesRoot: string,
  packageName: string,
  subpath: string | null
): Promise<ResolvedTypesBundle | null> => {
  const sanitizedName = stripVersion(packageName);
  const pkgDir = packageDirFor(modulesRoot, sanitizedName);
  if (!(await pathExists(pkgDir))) {
    return null;
  }

  const pkgJson = await readJsonFile(path.join(pkgDir, "package.json"));
  const candidates = new Set<string>();
  collectManifestCandidates(pkgJson, subpath, candidates);

  for (const guess of buildGuessList(subpath)) {
    addCandidatePath(candidates, guess);
  }

  const sorted = prioritizeCandidates(Array.from(candidates));
  let fallback: ResolvedTypesBundle | null = null;
  for (const candidate of sorted) {
    const normalized = normalizeRelativePath(candidate);
    if (!normalized) continue;
    const candidatePath = path.join(pkgDir, normalized);
    const text = await readTextFile(candidatePath);
    if (!text) continue;
    if (shouldIncludeModule(candidatePath)) {
      const extras = await collectRelativeModules(
        packageName,
        normalized,
        text,
        async (rel) => {
          const target = resolveWithinRoot(pkgDir, rel);
          if (!target) {
            return null;
          }
          return await readTextFile(target);
        },
        "local"
      );
      return {
        primary: makeResolvedModule(packageName, normalized, text, "local"),
        extras: await appendPackageJson(pkgDir, packageName, extras, pkgJson),
      };
    }
    if (!fallback) {
      fallback = {
        primary: makeResolvedModule(packageName, normalized, text, "local"),
        extras: [],
      };
    }
  }

  if (fallback) {
    return {
      primary: fallback.primary,
      extras: await appendPackageJson(
        pkgDir,
        packageName,
        fallback.extras,
        pkgJson
      ),
    };
  }

  return null;
};

const resolveTypesFromSandbox = async (
  notebookId: string,
  packageName: string,
  subpath: string | null
): Promise<ResolvedTypesBundle | null> => {
  const modulesRoot = sandboxNodeModulesPath(notebookId);
  if (!modulesRoot || !(await pathExists(modulesRoot))) {
    return null;
  }

  const direct = await resolveTypesFromLocalPackage(
    modulesRoot,
    packageName,
    subpath
  );
  if (direct) {
    return direct;
  }

  const stripped = stripVersion(packageName);
  if (!stripped.startsWith("@types/")) {
    const typesPackage = toTypesPackage(stripped);
    const typeResult = await resolveTypesFromLocalPackage(
      modulesRoot,
      typesPackage,
      subpath
    );
    if (typeResult) {
      return typeResult;
    }
  }

  return null;
};

const fetchCdnCandidate = async (
  pkg: string,
  relativePath: string
): Promise<string | null> => {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return null;
  const url = `https://unpkg.com/${encodeURIComponent(pkg)}/${normalized}`;
  return await fetchText(url);
};

const resolveTypesFromCdnPackage = async (
  pkg: string,
  subpath: string | null
): Promise<ResolvedTypesBundle | null> => {
  const pkgJsonUrl = `https://unpkg.com/${encodeURIComponent(pkg)}/package.json`;
  const pkgJson = await fetchJson<Record<string, unknown>>(pkgJsonUrl);
  if (!isRecord(pkgJson)) return null;

  const candidates = new Set<string>();
  collectManifestCandidates(pkgJson, subpath, candidates);

  for (const guess of buildGuessList(subpath)) {
    addCandidatePath(candidates, guess);
  }

  const sorted = prioritizeCandidates(Array.from(candidates));
  let fallback: ResolvedTypesBundle | null = null;
  for (const candidate of sorted) {
    const text = await fetchCdnCandidate(pkg, candidate);
    if (!text) continue;
    if (shouldIncludeModule(candidate)) {
      const normalized = normalizeRelativePath(candidate);
      if (!normalized) continue;
      const extras = await collectRelativeModules(
        pkg,
        normalized,
        text,
        async (rel) => await fetchCdnCandidate(pkg, rel),
        "cdn"
      );
      return {
        primary: makeResolvedModule(pkg, normalized, text, "cdn"),
        extras: await appendPackageJson(null, pkg, extras, pkgJson),
      };
    }
    if (!fallback) {
      const normalized = normalizeRelativePath(candidate);
      if (!normalized) continue;
      fallback = {
        primary: makeResolvedModule(pkg, normalized, text, "cdn"),
        extras: [],
      };
    }
  }

  if (fallback) {
    return {
      primary: fallback.primary,
      extras: await appendPackageJson(null, pkg, fallback.extras, pkgJson),
    };
  }

  return null;
};

export const registerTypesRoutes = (app: FastifyInstance) => {
  app.get("/types/:spec", async (request, reply) => {
    const parsed = SpecParam.safeParse(request.params);
    if (!parsed.success) {
      void reply.code(400).send({ error: "Invalid spec" });
      return;
    }
    const rawSpec = parsed.data.spec;
    const query = QueryParam.safeParse(request.query);
    const notebookId = query.success ? query.data.notebookId : undefined;

    if (rawSpec === "@nodebooks/ui") {
      reply.header("Content-Type", "application/json; charset=utf-8");
      reply.header("Cache-Control", "public, max-age=3600");
      void reply.send({
        data: {
          modules: [
            {
              content: uiHelpersModuleDts,
              relativePath: "index.d.ts",
              packageName: "@nodebooks/ui",
              source: "local",
            } satisfies ResolvedTypesModule,
          ],
        },
      });
      return;
    }

    // Prefer the sandbox install for this notebook, fall back to CDN mirrors.
    const { packageName, subpath, alias } = parsePackageSpec(rawSpec);
    let resolved: ResolvedTypesBundle | null = null;

    if (notebookId) {
      resolved = await resolveTypesFromSandbox(
        notebookId,
        packageName,
        subpath
      );
    }

    if (!resolved) {
      resolved = await resolveTypesFromCdnPackage(packageName, subpath);
    }

    if (!resolved) {
      // Try DefinitelyTyped
      const strippedPackageName = stripVersion(packageName);
      const basePkgName = strippedPackageName.startsWith("@types/")
        ? null
        : toTypesPackage(strippedPackageName);
      if (basePkgName) {
        if (notebookId) {
          resolved = await resolveTypesFromSandbox(
            notebookId,
            basePkgName,
            subpath
          );
        }
        if (!resolved) {
          resolved = await resolveTypesFromCdnPackage(basePkgName, subpath);
        }
      }
    }

    if (!resolved) {
      void reply.code(404).send({ error: "Types not found" });
      return;
    }

    const modulesBase = [resolved.primary, ...resolved.extras];
    const modulesWithAliases = expandModuleAliases(modulesBase);
    if (alias) {
      const aliasTarget = alias.startsWith("node:")
        ? alias.slice(5) || "node"
        : (subpath ?? packageName);
      const sanitizedAliasPath = normalizeRelativePath(
        `aliases/${alias.replace(/[^A-Za-z0-9@/_\-.]/g, "_")}.d.ts`
      );
      const aliasContent = `declare module "${alias}" {\n  export * from "${aliasTarget}";\n  export { default } from "${aliasTarget}";\n}`;
      modulesWithAliases.push(
        makeResolvedModule(
          packageName,
          sanitizedAliasPath,
          aliasContent,
          resolved.primary.source
        )
      );
    }
    const modules = expandModuleAliases(modulesWithAliases);

    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Cache-Control", "public, max-age=86400, immutable");
    void reply.send({ data: { modules } });
  });
};
