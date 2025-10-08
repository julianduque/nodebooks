import type { FastifyInstance } from "fastify";
import { z } from "zod";

const { uiHelpersModuleDts } = await import(
  "@nodebooks/notebook-ui/runtime/ui-helpers-dts"
);

const SPEC_RE = /^[A-Za-z0-9@/_\-.~%]+$/;
const JS_LIKE_RE = /\.(?:c|m)?(?:j|t)sx?$/i;

const SpecParam = z.object({ spec: z.string().min(1).regex(SPEC_RE) });

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
};

const parsePackageSpec = (raw: string): ParsedSpec => {
  if (raw.startsWith("@")) {
    const parts = raw.split("/");
    if (parts.length >= 3) {
      return {
        packageName: `${parts[0]}/${parts[1]}`,
        subpath: parts.slice(2).join("/"),
      };
    }
    return { packageName: raw, subpath: null };
  }
  const parts = raw.split("/");
  if (parts.length >= 2) {
    return { packageName: parts[0] ?? raw, subpath: parts.slice(1).join("/") };
  }
  return { packageName: raw, subpath: null };
};

const normalizeRelativePath = (path: string) =>
  path.replace(/^\.\/+/, "").replace(/^\//, "");

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
  return [
    `${normalized}.d.ts`,
    `${normalized}.ts`,
    `${normalized}/index.d.ts`,
    `${normalized}/index.ts`,
    `types/${normalized}.d.ts`,
    `types/${normalized}/index.d.ts`,
    `typings/${normalized}.d.ts`,
    `dist/${normalized}.d.ts`,
  ];
};

const fetchCandidate = async (
  pkg: string,
  relativePath: string
): Promise<string | null> => {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return null;
  const url = `https://unpkg.com/${encodeURIComponent(pkg)}/${normalized}`;
  return await fetchText(url);
};

const resolveTypesFromPackage = async (
  pkg: string,
  subpath: string | null
): Promise<string | null> => {
  const pkgJsonUrl = `https://unpkg.com/${encodeURIComponent(pkg)}/package.json`;
  const pkgJson = await fetchJson<Record<string, unknown>>(pkgJsonUrl);
  if (!isRecord(pkgJson)) return null;

  const candidates = new Set<string>();
  const candidateFields = ["types", "typings"] as const;
  for (const field of candidateFields) {
    addCandidatePath(candidates, pkgJson[field]);
  }

  collectFromExports(pkgJson["exports"], subpath, candidates);
  collectFromTypesVersions(pkgJson["typesVersions"], subpath, candidates);

  for (const guess of buildGuessList(subpath)) {
    addCandidatePath(candidates, guess);
  }

  for (const candidate of candidates) {
    const text = await fetchCandidate(pkg, candidate);
    if (text) return text;
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

    if (rawSpec === "@nodebooks/ui") {
      reply.header("Content-Type", "text/plain; charset=utf-8");
      reply.header("Cache-Control", "public, max-age=3600");
      void reply.send(uiHelpersModuleDts);
      return;
    }

    // Try package's own types via unpkg
    const { packageName, subpath } = parsePackageSpec(rawSpec);
    let dtsText = await resolveTypesFromPackage(packageName, subpath);

    if (!dtsText) {
      // Try DefinitelyTyped
      const basePkgName = packageName.startsWith("@types/")
        ? null
        : toTypesPackage(packageName);
      if (basePkgName) {
        dtsText = await resolveTypesFromPackage(basePkgName, subpath);
      }
    }

    if (!dtsText) {
      void reply.code(404).send({ error: "Types not found" });
      return;
    }

    reply.header("Content-Type", "text/plain; charset=utf-8");
    reply.header("Cache-Control", "public, max-age=86400, immutable");
    void reply.send(dtsText);
  });
};
