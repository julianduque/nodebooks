import { describe, it, expect } from "vitest";
import { NotebookRuntime } from "@nodebooks/runtime-node";
import { createCodeCell, NotebookEnvSchema } from "@nodebooks/notebook-schema";
import type { DisplayDataOutput } from "@nodebooks/notebook-schema";

const makeEnv = () =>
  NotebookEnvSchema.parse({ runtime: "node", packages: {}, variables: {} });

describe("runtime-node network policy", () => {
  it("allows http.request/get presence and blocks http.createServer", async () => {
    const rt = new NotebookRuntime();
    const env = makeEnv();
    const cell = createCodeCell({ language: "js", source: "" });
    // Check allowed client APIs are present
    let res = await rt.execute({
      cell,
      code: `const http = require('node:http'); typeof http.request + '|' + typeof http.get;`,
      notebookId: "n1",
      env,
    });
    const out = res.outputs.find((o) => o.type === "display_data") as
      | DisplayDataOutput
      | undefined;
    const text = out?.data?.["text/plain"] as string;
    expect(text).toMatch(/function\|function/);

    // Attempt to create server should throw
    res = await rt.execute({
      cell,
      code: `const http = require('node:http'); http.createServer(()=>{});`,
      notebookId: "n1",
      env,
    });
    const err = res.outputs.find((o) => o.type === "error");
    expect(err).toBeTruthy();
  });

  it("blocks dgram.bind", async () => {
    const rt = new NotebookRuntime();
    const env = makeEnv();
    const cell = createCodeCell({ language: "js", source: "" });
    const res = await rt.execute({
      cell,
      code: `const d = require('node:dgram').createSocket('udp4'); d.bind(0); 'ok'`,
      notebookId: "n2",
      env,
    });
    const err = res.outputs.find((o) => o.type === "error");
    expect(err).toBeTruthy();
  });
});
