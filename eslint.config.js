import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";

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
      "packages/notebook-ui/src/runtime/ui-helpers-dts.js",
      "packages/notebook-ui/src/runtime/ui-helpers-module.js",
    ],
  },
  {
    plugins: {
      "@next/next": nextPlugin,
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
    },
  },
  {
    files: ["apps/client/**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    settings: nextSettings,
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
];
