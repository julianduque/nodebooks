import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCodeCell } from "@nodebooks/notebook-schema";
import { NotebookRuntime } from "./runtime.js";

const createEnv = (packages: Record<string, string> = {}) => ({
  runtime: "node" as const,
  version: "20.x",
  packages,
});

const createTempRoot = async () => {
  return fs.mkdtemp(join(tmpdir(), "nodebooks-runtime-test-"));
};

type RuntimeOptions = ConstructorParameters<typeof NotebookRuntime>[0];

const withRuntime = async (
  options: RuntimeOptions | undefined,
  run: (runtime: NotebookRuntime, root: string) => Promise<void>
) => {
  const root = await createTempRoot();
  const runtime = new NotebookRuntime({ ...(options ?? {}), workspaceRoot: root });
  try {
    await run(runtime, root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
};

describe("NotebookRuntime", () => {
  it("executes JavaScript and captures console output", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-js", language: "js" });
      const streams: string[] = [];

      const result = await runtime.execute({
        cell,
        code: "console.log('hello runtime'); 2 + 3;",
        notebookId: "notebook-basic",
        env: createEnv(),
        onStream: (output) => {
          streams.push(output.text.trim());
        },
      });

      expect(result.execution.status).toBe("ok");
      expect(streams.some((line) => line.includes("hello runtime"))).toBe(
        true
      );
      expect(
        result.outputs.some((output) => output.type === "display_data")
      ).toBe(true);
    });
  });

  it("transpiles TypeScript before execution", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-ts", language: "ts" });

      const result = await runtime.execute({
        cell,
        code: "const add = (a: number, b: number): number => a + b; add(1, 2);",
        notebookId: "notebook-ts",
        env: createEnv(),
      });

      expect(result.execution.status).toBe("ok");
      expect(
        result.outputs.some((output) => output.type === "display_data")
      ).toBe(true);
    });
  });

  it("reports execution errors", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-error", language: "js" });

      const result = await runtime.execute({
        cell,
        code: "throw new Error('boom');",
        notebookId: "notebook-error",
        env: createEnv(),
      });

      expect(result.execution.status).toBe("error");
      const last = result.outputs[result.outputs.length - 1];
      expect(last?.type).toBe("error");
    });
  });

  it("loads sandboxed dependencies using the installer hook", async () => {
    await withRuntime(
      {
        installDependencies: async (cwd) => {
          const moduleRoot = join(cwd, "node_modules", "demo-package");
          await fs.mkdir(moduleRoot, { recursive: true });
          await fs.writeFile(
            join(moduleRoot, "package.json"),
            JSON.stringify({
              name: "demo-package",
              version: "1.0.0",
              main: "index.js",
            })
          );
          await fs.writeFile(
            join(moduleRoot, "index.js"),
            "module.exports = () => 'installed-package';\n"
          );
        },
      },
      async (runtime) => {
        const cell = createCodeCell({ id: "cell-deps", language: "js" });

        const result = await runtime.execute({
          cell,
          code: "const demo = require('demo-package'); demo();",
          notebookId: "notebook-deps",
          env: createEnv({ "demo-package": "^1.0.0" }),
        });

        const display = result.outputs.find(
          (output) => output.type === "display_data"
        );
        expect(display).toBeDefined();
        const plain = display?.data?.["text/plain"];
        expect(String(plain)).toContain("installed-package");
      }
    );
  });

  it("restricts fs access to the sandbox directory", async () => {
    await withRuntime(
      { installDependencies: async () => {} },
      async (runtime) => {
        const cell = createCodeCell({ id: "cell-fs", language: "js" });

        const result = await runtime.execute({
          cell,
          code: [
            "const fs = require('fs');",
            "try {",
            "  fs.writeFileSync('/etc/hosts', 'nope');",
            "  'allowed';",
            "} catch (error) {",
            "  error.message;",
            "}",
          ].join("\n"),
          notebookId: "notebook-fs",
          env: createEnv(),
        });

        const display = result.outputs.find(
          (output) => output.type === "display_data"
        );
        expect(display).toBeDefined();
        const message = display?.data?.["text/plain"];
        expect(String(message)).toContain("not allowed");
      }
    );
  });

  it("sets process.cwd() to the sandbox directory", async () => {
    await withRuntime(undefined, async (runtime) => {
      const cell = createCodeCell({ id: "cell-cwd", language: "js" });

      const result = await runtime.execute({
        cell,
        code: "process.cwd();",
        notebookId: "notebook-cwd",
        env: createEnv(),
      });

      const display = result.outputs.find(
        (output) => output.type === "display_data"
      );
      expect(display).toBeDefined();
      const plain = display?.data?.["text/plain"];
      expect(String(plain)).toContain("notebook-cwd");
    });
  });
});
