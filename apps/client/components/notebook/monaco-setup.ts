"use client";

type MonacoT = typeof import("monaco-editor");
type TSCompilerOptions =
  import("monaco-editor").languages.typescript.CompilerOptions;
type TSDiagnosticsOptions =
  import("monaco-editor").languages.typescript.DiagnosticsOptions;
import { ensureNodebooksUiTypes } from "@/components/notebook/monaco-extra-libs";

let initialized = false;
let monacoRef: MonacoT | null = null;

// Diagnostic codes that tend to be noisy in a notebook context
// 2304: Cannot find name
// 2307: Cannot find module
// 7016: Could not find a declaration file for module
// 2580: Cannot find name 'require' (Node globals), often noisy
const DEFAULT_IGNORED_DIAGNOSTICS = [2304, 2307, 7016, 2580];

export type DiagnosticPolicy =
  | { mode: "off" }
  | { mode: "ignore-list"; ignore?: number[] }
  | { mode: "full" };

let currentPolicy: DiagnosticPolicy = { mode: "ignore-list" };

export const getMonaco = () => monacoRef;

export function setDiagnosticPolicy(policy: DiagnosticPolicy) {
  currentPolicy = policy;
  if (!monacoRef) return;
  applyDiagnosticsPolicy(monacoRef, policy);
}

function applyDiagnosticsPolicy(monaco: MonacoT, policy: DiagnosticPolicy) {
  const js = monaco.languages.typescript.javascriptDefaults;
  const ts = monaco.languages.typescript.typescriptDefaults;

  if (policy.mode === "off") {
    js.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });
    ts.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });
    return;
  }

  if (policy.mode === "full") {
    js.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    ts.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    });
    return;
  }

  const ignore = policy.ignore ?? DEFAULT_IGNORED_DIAGNOSTICS;
  js.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: ignore,
  } as unknown as TSDiagnosticsOptions);
  ts.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: ignore,
  } as unknown as TSDiagnosticsOptions);
}

export function initMonaco(monaco: MonacoT) {
  if (initialized && monacoRef) {
    return;
  }
  monacoRef = monaco;

  const commonCompiler: TSCompilerOptions = {
    allowJs: true,
    checkJs: false,
    noEmit: true,
    strict: false,
    // Allow default-importing CommonJS modules like axios
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    resolveJsonModule: true,
    skipLibCheck: true,
    lib: ["es2022", "dom"],
    jsx: monaco.languages.typescript.JsxEmit.None,
    useDefineForClassFields: false,
  };

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(
    commonCompiler
  );
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(
    commonCompiler
  );

  // Provide standard libs for DOM/ES by default
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    "declare const console: any;",
    "nb:///env/console.d.ts"
  );
  // Wildcard module shim to suppress missing-module squiggles; specific libs override this
  const wildcard =
    'declare module "*" { const x: any; export = x; export default x; }';
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    wildcard,
    "nb:///modules/__all__.d.ts"
  );
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    wildcard,
    "nb:///modules/__all__.d.ts"
  );

  applyDiagnosticsPolicy(monaco, currentPolicy);

  // Provide local types for the virtual UI helper package used in code cells
  ensureNodebooksUiTypes();

  initialized = true;
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("nodebooks:monaco-ready"));
    }
  } catch {}
}
