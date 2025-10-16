import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import pluginImport from "eslint-plugin-import";
import pluginJsxA11y from "eslint-plugin-jsx-a11y";
import pluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import pluginReactHooks from "eslint-plugin-react-hooks";
import reactJsxRuntime from "eslint-plugin-react/configs/jsx-runtime.js";
import reactRecommended from "eslint-plugin-react/configs/recommended.js";
import globals from "globals";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

const tsFilePatterns = ["**/*.{ts,tsx,cts,mts}"];

const tsConfigs = tseslint.configs["flat/recommended"].map((config) => ({
  ...config,
  files: config.files ?? tsFilePatterns,
  languageOptions: {
    ...(config.languageOptions ?? {}),
    parser: tsParser,
    parserOptions: {
      ...(config.languageOptions?.parserOptions ?? {}),
      project: "./tsconfig.json",
      tsconfigRootDir,
    },
  },
}));

const reactHooksConfig = pluginReactHooks.configs.recommended;
const jsxA11yConfig = pluginJsxA11y.configs.recommended;
const importConfig = pluginImport.configs.recommended;

export default [
  {
    ignores: ["**/*.d.ts", "node_modules", ".next", "out", "docs"],
  },
  js.configs.recommended,
  ...tsConfigs,
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      ...reactRecommended.plugins,
      "react-hooks": pluginReactHooks,
      "jsx-a11y": pluginJsxA11y,
      import: pluginImport,
      "@next/next": nextPlugin.default ?? nextPlugin,
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": {
        node: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
        typescript: {},
      },
    },
    rules: {
      ...reactRecommended.rules,
      ...reactJsxRuntime.rules,
      ...reactHooksConfig.rules,
      ...jsxA11yConfig.rules,
      ...importConfig.rules,
      ...(nextPlugin.flatConfig?.coreWebVitals?.rules ?? {}),
      "react-hooks/set-state-in-effect": "off",
      "jsx-a11y/heading-has-content": "off",
    },
  },
  pluginPrettierRecommended,
];
