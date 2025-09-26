import type { FastifyInstance } from "fastify";
import { z } from "zod";

const SPEC_RE = /^[A-Za-z0-9@/_\-.~%]+$/;

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

export const registerTypesRoutes = (app: FastifyInstance) => {
  app.get("/types/:spec", async (request, reply) => {
    const parsed = SpecParam.safeParse(request.params);
    if (!parsed.success) {
      void reply.code(400).send({ error: "Invalid spec" });
      return;
    }
    const rawSpec = parsed.data.spec;

    // Try package's own types via unpkg
    const pkgJsonUrl = `https://unpkg.com/${encodeURIComponent(rawSpec)}/package.json`;
    const pkg = await fetchJson<Record<string, unknown>>(pkgJsonUrl);
    const candidateFields = ["types", "typings"] as const;
    let dtsText: string | null = null;

    if (isRecord(pkg)) {
      let entry: string | null = null;
      for (const k of candidateFields) {
        const val = (pkg as Record<string, unknown>)[k];
        if (typeof val === "string") {
          entry = val;
          break;
        }
      }
      const exportsField = (pkg as Record<string, unknown>)["exports"];
      if (!entry && exportsField && typeof exportsField === "object") {
        // attempt ./index.d.ts via exports["."]?.types
        const dot = (exportsField as Record<string, unknown>)["."];
        const typesVal = isRecord(dot) ? dot["types"] : undefined;
        if (typeof typesVal === "string") {
          entry = typesVal;
        }
      }
      if (!entry) {
        // common fallbacks
        const guesses = [
          "index.d.ts",
          "dist/index.d.ts",
          "types/index.d.ts",
          "typings/index.d.ts",
        ];
        for (const g of guesses) {
          const url = `https://unpkg.com/${encodeURIComponent(rawSpec)}/${g}`;
          dtsText = await fetchText(url);
          if (dtsText) break;
        }
      } else {
        const url = `https://unpkg.com/${encodeURIComponent(rawSpec)}/${entry}`;
        dtsText = await fetchText(url);
      }
    }

    if (!dtsText) {
      // Try DefinitelyTyped
      const atTypesSpec = toTypesPackage(rawSpec.replace(/@[^@]+$/, ""));
      const typesPkgUrl = `https://unpkg.com/${encodeURIComponent(atTypesSpec)}/package.json`;
      const typesPkg = await fetchJson<Record<string, unknown>>(typesPkgUrl);
      if (isRecord(typesPkg)) {
        let entry: string | null = null;
        for (const k of candidateFields) {
          const val = (typesPkg as Record<string, unknown>)[k];
          if (typeof val === "string") {
            entry = val;
            break;
          }
        }
        if (!entry) {
          const guesses = ["index.d.ts", "dist/index.d.ts", "types/index.d.ts"];
          for (const g of guesses) {
            const url = `https://unpkg.com/${encodeURIComponent(atTypesSpec)}/${g}`;
            dtsText = await fetchText(url);
            if (dtsText) break;
          }
        } else {
          const url = `https://unpkg.com/${encodeURIComponent(atTypesSpec)}/${entry}`;
          dtsText = await fetchText(url);
        }
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
