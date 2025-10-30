import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolveWorkspace = (...segments: string[]): string => {
  const rootDir = fileURLToPath(new URL(".", import.meta.url));
  return path.resolve(rootDir, ...segments);
};

export default defineConfig({
  resolve: {
    alias: {
      "@nodebooks/notebook-schema": resolveWorkspace(
        "../../packages/notebook-schema/src/index.ts"
      ),
      "@nodebooks/config": resolveWorkspace(
        "../../packages/config/src/index.ts"
      ),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
