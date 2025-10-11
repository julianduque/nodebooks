import { beforeEach, afterEach, describe, expect, it } from "vitest";
import Fastify from "fastify";

import { registerAttachmentRoutes } from "../src/routes/attachments.js";
import { registerPublicViewRoutes } from "../src/routes/public.js";
import type {
  Notebook,
  NotebookAttachmentContent,
  NotebookCollaboratorStore,
  NotebookStore,
  Project,
  ProjectStore,
} from "../src/types.js";

const createNotebook = (overrides: Partial<Notebook>): Notebook => ({
  id: "notebook-id",
  name: "Test Notebook",
  env: { runtime: "node", version: "20.0.0", packages: {}, variables: {} },
  cells: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  projectId: null,
  projectOrder: null,
  published: false,
  publicSlug: null,
  ...overrides,
});

const createAttachment = (
  overrides: Partial<NotebookAttachmentContent>
): NotebookAttachmentContent => {
  const content = overrides.content ?? new TextEncoder().encode("hello world");
  return {
    id: "attachment-id",
    notebookId: "notebook-id",
    filename: "hello.txt",
    mimeType: "text/plain",
    size: content.byteLength,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    content,
    ...overrides,
  };
};

const createStores = () => {
  const publishedNotebook = createNotebook({
    id: "pub-1",
    name: "Published",
    published: true,
    publicSlug: "published",
    projectId: "proj-1",
  });
  const privateNotebook = createNotebook({ id: "priv-1", name: "Private" });

  const notebooks = new Map<string, Notebook>([
    [publishedNotebook.id, publishedNotebook],
    [privateNotebook.id, privateNotebook],
  ]);

  const attachments = new Map<string, Map<string, NotebookAttachmentContent>>([
    [
      publishedNotebook.id,
      new Map([
        [
          "att-1",
          createAttachment({
            id: "att-1",
            notebookId: publishedNotebook.id,
            filename: "greeting.txt",
            content: new TextEncoder().encode("hello"),
          }),
        ],
      ]),
    ],
    [
      privateNotebook.id,
      new Map([
        ["att-1", createAttachment({ notebookId: privateNotebook.id })],
      ]),
    ],
  ]);

  const notebookStore: NotebookStore = {
    async all() {
      return Array.from(notebooks.values());
    },
    async get(id: string) {
      return notebooks.get(id);
    },
    async getByPublicSlug(slug: string) {
      return Array.from(notebooks.values()).find(
        (entry) => entry.publicSlug === slug
      );
    },
    async save(notebook: Notebook) {
      notebooks.set(notebook.id, notebook);
      return notebook;
    },
    async remove(id: string) {
      const entry = notebooks.get(id);
      notebooks.delete(id);
      return entry ?? undefined;
    },
    async listAttachments(notebookId: string) {
      const bucket = attachments.get(notebookId);
      if (!bucket) return [];
      return Array.from(bucket.values()).map(({ content, ...meta }) => meta);
    },
    async getAttachment(notebookId: string, attachmentId: string) {
      return attachments.get(notebookId)?.get(attachmentId);
    },
    async saveAttachment() {
      throw new Error("Not implemented");
    },
    async removeAttachment(notebookId: string, attachmentId: string) {
      const bucket = attachments.get(notebookId);
      if (!bucket) return false;
      return bucket.delete(attachmentId);
    },
  };

  const project: Project = {
    id: "proj-1",
    name: "Sample Project",
    slug: "sample-project",
    published: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const projectStore: ProjectStore = {
    async list() {
      return [project];
    },
    async get(id: string) {
      return id === project.id ? project : undefined;
    },
    async getBySlug(slug: string) {
      return slug === project.slug ? project : undefined;
    },
    async create() {
      throw new Error("Not implemented");
    },
    async update() {
      throw new Error("Not implemented");
    },
    async remove() {
      return false;
    },
  };

  return {
    notebookStore,
    projectStore,
    collaboratorStore: {
      async get() {
        return undefined;
      },
    } satisfies Partial<NotebookCollaboratorStore>,
  };
};

const textDecoder = new TextDecoder();

describe("public notebook attachments", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    const { notebookStore, collaboratorStore, projectStore } = createStores();
    app = Fastify();
    registerAttachmentRoutes(
      app,
      notebookStore,
      collaboratorStore as NotebookCollaboratorStore
    );
    registerPublicViewRoutes(app, {
      store: notebookStore,
      projects: projectStore,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves attachment content for published notebooks without auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/notebooks/pub-1/attachments/att-1/content",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/plain/);
    expect(textDecoder.decode(response.rawPayload)).toBe("hello");
  });

  it("rejects attachment access for private notebooks without auth", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/notebooks/priv-1/attachments/att-1/content",
    });

    expect(response.statusCode).toBe(401);
  });

  it("serves published attachments via public notebook identifier", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/public/notebooks/published/attachments/att-1/content",
    });

    expect(response.statusCode).toBe(200);
    expect(textDecoder.decode(response.rawPayload)).toBe("hello");
  });

  it("serves published attachments via public project paths", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/public/projects/sample-project/notebooks/published/attachments/att-1/content",
    });

    expect(response.statusCode).toBe(200);
    expect(textDecoder.decode(response.rawPayload)).toBe("hello");
  });
});
