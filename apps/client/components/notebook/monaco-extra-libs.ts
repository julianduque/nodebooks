"use client";

type IDisposable = import("monaco-editor").IDisposable;
import { getMonaco } from "@/components/notebook/monaco-setup";
import { clientConfig } from "@nodebooks/config/client";
import { nodebooksUiDts } from "@/components/notebook/monaco-local-types";

// Manages Monaco extra libs: globals d.ts and module shims/types per package

let globalsLib: IDisposable | null = null;
const moduleLibs = new Map<string, IDisposable>();
const fetchedTypesCache = new Map<string, string>();
let nbUiTypesLoaded = false;

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

// Placeholder for future real type acquisition. For now we add a shim.
export async function ensurePackageTypes(pkg: string) {
  const monaco = getMonaco();
  // If Monaco not ready yet, just shim now; a later sync can replace with real types
  if (!monaco) {
    addModuleShim(pkg);
    return;
  }

  const key = pkg;
  if (fetchedTypesCache.has(key)) {
    const src = fetchedTypesCache.get(key)!;
    registerTypesLib(pkg, src);
    return;
  }

  try {
    const apiBase = clientConfig().apiBaseUrl;
    const res = await fetch(`${apiBase}/types/${encodeURIComponent(pkg)}`);
    if (res.ok) {
      const text = await res.text();
      fetchedTypesCache.set(key, text);
      registerTypesLib(pkg, text);
      return;
    }
  } catch {
    // ignore and fall back to shim
  }

  addModuleShim(pkg);
}

function registerTypesLib(spec: string, src: string) {
  const monaco = getMonaco();
  if (!monaco) return;
  const uri = `nb:///types/${spec}.d.ts`;
  // If a shim exists for the same spec, we keep both; TS picks the more specific
  monaco.languages.typescript.typescriptDefaults.addExtraLib(src, uri);
  monaco.languages.typescript.javascriptDefaults.addExtraLib(src, uri);
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
