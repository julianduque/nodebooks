import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const nextSettings = {
  next: {
    rootDir: "apps/client",
    pagesDir: [],
  },
};

export default [
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/out/**",
      "**/coverage/**",
      "**/build/**",
      "**/vitest.config.*",
      "**/next.config.*",
      "**/postcss.config.*",
      "**/tailwind.config.*",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.test.js",
      "packages/ui/src/runtime/ui-helpers-dts.js",
      "packages/ui/src/runtime/ui-helpers-module.js",
      // Re-export .js files that use TypeScript syntax
      "packages/*/src/**/*.js",
      "packages/*/src/**/frontend/*.js",
      "packages/*/src/**/public/*.js",
    ],
  },
  {
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: nextSettings,
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-empty-object-type": "off", // Allow interfaces extending generic types with parameters
    },
  },
  {
    files: ["apps/client/**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: nextSettings,
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
