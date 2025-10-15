import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(fileURLToPath(import.meta.url));
const uiHelpersPath = resolve(rootDir, "../ui/src/runtime/ui-helpers-dts.js");
const uiHelpersModulePath = resolve(
  rootDir,
  "../ui/src/runtime/ui-helpers-module.js"
);

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@nodebooks/ui/runtime/ui-helpers-dts": uiHelpersPath,
      "@nodebooks/ui/runtime/ui-helpers-module": uiHelpersModulePath,
    },
  },
});
