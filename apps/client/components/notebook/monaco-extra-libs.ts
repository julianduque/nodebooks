"use client";

type IDisposable = import("monaco-editor").IDisposable;
import { getMonaco } from "@/components/notebook/monaco-setup";
import { clientConfig } from "@nodebooks/config/client";
import { uiHelpersModuleDts as nodebooksUiDts } from "@nodebooks/notebook-ui/runtime/ui-helpers-dts";

// Manages Monaco extra libs: globals d.ts and module shims/types per package

let globalsLib: IDisposable | null = null;
const moduleLibs = new Map<string, IDisposable>();
const trackedLibs = new Map<string, IDisposable>();
const fetchedTypesCache = new Map<string, ResolvedTypesModule[]>();
const failedTypeFetches = new Set<string>();
const scopePathAliases = new Set<string>();
let nbUiTypesLoaded = false;

const cacheKeyFor = (pkg: string, notebookId?: string) =>
  notebookId ? `${notebookId}::${pkg}` : pkg;

const sanitizeNotebookId = (value?: string) =>
  value ? value.replace(/[^A-Za-z0-9._-]/g, "_") : "default";

export function setGlobalsDts(src: string) {
  const monaco = getMonaco();
  if (!monaco) return;
  if (globalsLib) {
    try {
      globalsLib.dispose();
    } catch {}
    globalsLib = null;
  }
  globalsLib = monaco.languages.typescript.typescriptDefaults.addExtraLib(
    src,
    "nb:///globals.d.ts"
  );
  // JS defaults share the same libs
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    src,
    "nb:///globals.d.ts"
  );
}

export function addModuleShim(pkg: string) {
  const monaco = getMonaco();
  if (!monaco) return;
  const key = pkg;
  if (moduleLibs.has(key)) return;
  const shim = `declare module "${pkg}" { const x: any; export = x; export default x; }`;
  const disposer = monaco.languages.typescript.typescriptDefaults.addExtraLib(
    shim,
    `nb:///modules/${pkg}.d.ts`
  );
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    shim,
    `nb:///modules/${pkg}.d.ts`
  );
  moduleLibs.set(key, disposer);
}

function removeModuleShim(pkg: string) {
  const disposer = moduleLibs.get(pkg);
  if (!disposer) return;
  try {
    disposer.dispose();
  } catch {}
  moduleLibs.delete(pkg);
}

// Placeholder for future real type acquisition. For now we add a shim.
type ResolvedTypesModule = {
  content: string;
  relativePath: string;
  packageName: string;
  source: "local" | "cdn";
};

export async function ensurePackageTypes(pkg: string, notebookId?: string) {
  const monaco = getMonaco();
  // If Monaco not ready yet, just shim now; a later sync can replace with real types
  if (!monaco) {
    addModuleShim(pkg);
    return;
  }

  const key = cacheKeyFor(pkg, notebookId);
  if (fetchedTypesCache.has(key)) {
    ensureScopeModuleResolution(notebookId);
    registerModules(pkg, fetchedTypesCache.get(key)!, notebookId);
    return;
  }

  if (failedTypeFetches.has(key)) {
    addModuleShim(pkg);
    return;
  }

  try {
    const apiBase = clientConfig().apiBaseUrl;
    const params = notebookId
      ? `?notebookId=${encodeURIComponent(notebookId)}`
      : "";
    const res = await fetch(
      `${apiBase}/types/${encodeURIComponent(pkg)}${params}`
    );
    if (res.ok) {
      const payload = (await res.json()) as {
        data?: { modules?: ResolvedTypesModule[] };
      };
      const modules = payload?.data?.modules?.filter(Boolean) ?? [];
      if (modules.length > 0) {
        fetchedTypesCache.set(key, modules);
        failedTypeFetches.delete(key);
        ensureScopeModuleResolution(notebookId);
        registerModules(pkg, modules, notebookId);
        return;
      }
      return;
    }
    if (res.status === 404) {
      failedTypeFetches.add(key);
    }
  } catch {
    // ignore and fall back to shim
    failedTypeFetches.add(key);
  }

  addModuleShim(pkg);
}

function registerModules(
  spec: string,
  modules: ResolvedTypesModule[],
  notebookId?: string
) {
  const monaco = getMonaco();
  if (!monaco) {
    return;
  }
  const scope = sanitizeNotebookId(notebookId);
  ensureScopeModuleResolution(notebookId);
  modules.forEach((module, index) => {
    const packageBase = `nb:///types/${scope}/node_modules/${module.packageName}`;
    const resolvedUri = `${packageBase}/${module.relativePath}`;
    addLib(monaco, module.content, resolvedUri);
    if (index === 0) {
      const specUri = `nb:///types/${scope}/${spec}.d.ts`;
      addLib(monaco, module.content, specUri);
      removeModuleShim(spec);
      const alias = `declare module "${spec}" {
  export * from "${resolvedUri}";
}`;
      addLib(monaco, alias, `nb:///modules/${scope}/${spec}.alias.d.ts`);
    }
  });
}

function addLib(
  monaco: typeof import("monaco-editor"),
  src: string,
  uri: string
) {
  disposeTracked(uri);
  const tsDisposer = monaco.languages.typescript.typescriptDefaults.addExtraLib(
    src,
    uri
  );
  const jsDisposer = monaco.languages.typescript.javascriptDefaults.addExtraLib(
    src,
    uri
  );
  trackedLibs.set(uri, {
    dispose: () => {
      try {
        tsDisposer.dispose();
      } catch {}
      try {
        jsDisposer.dispose();
      } catch {}
    },
  });
}

function disposeTracked(uri: string) {
  const entry = trackedLibs.get(uri);
  if (!entry) return;
  try {
    entry.dispose();
  } catch {}
  trackedLibs.delete(uri);
}

function ensureScopeModuleResolution(notebookId?: string) {
  const monaco = getMonaco();
  if (!monaco) return;
  const scope = sanitizeNotebookId(notebookId);
  if (scopePathAliases.has(scope)) {
    return;
  }
  scopePathAliases.add(scope);
  const tsDefaults = monaco.languages.typescript.typescriptDefaults;
  const jsDefaults = monaco.languages.typescript.javascriptDefaults;
  const current = tsDefaults.getCompilerOptions?.() ?? {};
  const paths = { ...(current.paths ?? {}) };
  const wildcard = paths["*"] ?? ["*"];
  const aliasPath = `nb:///types/${scope}/node_modules/*`;
  if (!wildcard.includes(aliasPath)) {
    paths["*"] = [aliasPath, ...wildcard];
    const next = { ...current, paths };
    tsDefaults.setCompilerOptions(next);
    jsDefaults.setCompilerOptions(next);
  }
}

export function clearAllExtraLibs() {
  if (globalsLib) {
    try {
      globalsLib.dispose();
    } catch {}
    globalsLib = null;
  }
  for (const [, d] of moduleLibs) {
    try {
      d.dispose();
    } catch {}
  }
  moduleLibs.clear();
  for (const [, disposer] of trackedLibs) {
    try {
      disposer.dispose();
    } catch {}
  }
  trackedLibs.clear();
  scopePathAliases.clear();
}

// Ensure local types for the virtual runtime package '@nodebooks/ui'
export function ensureNodebooksUiTypes() {
  if (nbUiTypesLoaded) return;
  const monaco = getMonaco();
  if (!monaco) return;
  const uri = "nb:///types/@nodebooks/ui/index.d.ts";
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    nodebooksUiDts,
    uri
  );
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    nodebooksUiDts,
    uri
  );
  nbUiTypesLoaded = true;
}
