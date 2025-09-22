# NodeBooks

NodeBooks is an experimental JS/TS notebook environment that pairs a Fastify API with a Next.js UI. The current MVP supports editing Markdown and code cells, executing TypeScript or JavaScript against a sandboxed runtime, and streaming outputs back to the browser in real time.

## Project layout

```
nodebooks/
├── apps/
│   ├── backend/          # Fastify 5 API server with REST + WebSocket kernel bridge
│   └── client/           # Next.js 15 client with Monaco-powered notebook UI
├── packages/
│   └── notebook-schema/  # Shared schema + kernel protocol helpers
├── Dockerfile            # Local development container (pnpm dev inside)
├── package.json          # pnpm workspace configuration
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Getting started

Install dependencies with pnpm (v10+).

Single-port dev (Fastify serves Next.js):

```bash
pnpm install
pnpm --filter @nodebooks/api dev
```

- App: http://localhost:4000 (Fastify + Next.js dev)

Legacy multi-process dev (separate ports):

```bash
pnpm dev
```

- API: http://localhost:4000
- UI: http://localhost:3000

The UI now fetches notebooks from the API, shows a sidebar of available notebooks, persists edits automatically, and opens a WebSocket session per notebook. Executing a code cell streams console output and final results from the Node-based runtime.

The API stores notebook documents in a SQLite database located at `./data/nodebooks.sqlite` by default. Set the `NODEBOOKS_SQLITE_PATH` environment variable to point to a different file if needed.

### Running tests & quality checks

```bash
pnpm lint           # ESLint (root config across all workspaces)
pnpm test           # Vitest across all workspaces
pnpm format:check   # Prettier check (no writes)
```

These commands run across all workspaces. Unit tests cover the shared schema helpers and the kernel runtime execution engine. The project uses Vitest 3 with globals enabled.

To verify dependency freshness run:

```bash
pnpm outdated
```

### Formatting

Prettier enforces code style (2-space indent, double quotes). Run:

```bash
pnpm format         # Write formatting changes
pnpm format:check   # Verify formatting without writes
```

Configuration lives in `.prettierrc`; generated/build artifacts and `apps/backend/data` are ignored via `.prettierignore`.

### Docker workflow

A production-oriented Dockerfile is included. Build the image and run a single server that serves both API and UI on one port:

```bash
docker build -t nodebooks .
docker run --rm -it -p 4000:4000 nodebooks
```

### Next steps

- Harden the runtime sandbox (resource limits, module allow lists)
- Introduce Postgres persistence for shared/cloud deployments
- Implement interrupt/restart flows and package installation hooks
- Expand the UI with richer output renderers and collaboration primitives

## License

MIT
