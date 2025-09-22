import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  createCodeCell,
  createEmptyNotebook,
} from "@nodebooks/notebook-schema";
import { SqliteNotebookStore } from "../src/store/sqlite.js";

describe("SqliteNotebookStore", () => {
  let directory: string;
  let databaseFile: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "nodebooks-sqlite-"));
    databaseFile = path.join(directory, "test.sqlite");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("persists notebooks across operations", async () => {
    const store = new SqliteNotebookStore({ databaseFile });

    const notebook = createEmptyNotebook({
      name: "Test Notebook",
      cells: [
        createCodeCell({
          language: "ts",
          source: "const value: number = 2 + 2;\nvalue;",
        }),
      ],
    });

    const saved = await store.save(notebook);
    expect(saved.id).toBe(notebook.id);

    const found = await store.get(saved.id);
    expect(found?.name).toBe("Test Notebook");
    expect(found?.cells).toHaveLength(1);

    const all = await store.all();
    expect(all).toHaveLength(1);

    const updated = await store.save({ ...saved, name: "Updated Notebook" });
    expect(updated.updatedAt).not.toBe(saved.updatedAt);
    expect(updated.name).toBe("Updated Notebook");

    const fetched = await store.get(saved.id);
    expect(fetched?.name).toBe("Updated Notebook");

    const removed = await store.remove(saved.id);
    expect(removed?.id).toBe(saved.id);
    expect(await store.get(saved.id)).toBeUndefined();
  });

  it("shares state between store instances", async () => {
    const first = new SqliteNotebookStore({ databaseFile });
    const notebook = createEmptyNotebook({ name: "Shared Notebook" });
    await first.save(notebook);

    const second = new SqliteNotebookStore({ databaseFile });
    const all = await second.all();
    expect(all.map((item) => item.id)).toContain(notebook.id);
  });
});
