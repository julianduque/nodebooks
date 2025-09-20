# NodeBooks

NodeBooks is an experimental JS/TS notebook environment that pairs a Fastify API with a Next.js UI. The current MVP supports editing Markdown and code cells, executing TypeScript or JavaScript against a sandboxed runtime, and streaming outputs back to the browser in real time.

## Project layout

```
nodebooks/
├── apps/
│   ├── api/              # Fastify 5 API server with REST + WebSocket kernel bridge
│   └── ui/               # Next.js 15 client with Monaco-powered notebook UI
├── packages/
│   └── notebook-schema/  # Shared schema + kernel protocol helpers
├── Dockerfile            # Local development container (pnpm dev inside)
├── package.json          # pnpm workspace configuration
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Getting started

Install dependencies with pnpm (v10+), then launch the API and UI in parallel:

```bash
pnpm install
pnpm dev
```

- API: http://localhost:4000 (Fastify, REST, WebSocket kernel)
- UI: http://localhost:3000 (Next.js 15)

The UI now fetches notebooks from the API, shows a sidebar of available notebooks, persists edits automatically, and opens a WebSocket session per notebook. Executing a code cell streams console output and final results from the Node-based runtime.

The API stores notebook documents in a SQLite database located at `./data/nodebooks.sqlite` by default. Set the `NODEBOOKS_SQLITE_PATH` environment variable to point to a different file if needed.

### Running tests & quality checks

```bash
pnpm lint
pnpm test
```

Both commands run across all workspaces. Unit tests cover the shared schema helpers and the kernel runtime execution engine. The project uses Vitest 3 with globals enabled.

To verify dependency freshness run:

```bash
pnpm outdated
```

### Docker workflow

A development-friendly Dockerfile is included. Build the image and run the workspace processes inside the container:

```bash
docker build -t nodebooks-dev .
docker run --rm -it -p 3000:3000 -p 4000:4000 nodebooks-dev
```

### Next steps

- Harden the runtime sandbox (resource limits, module allow lists)
- Introduce Postgres persistence for shared/cloud deployments
- Implement interrupt/restart flows and package installation hooks
- Expand the UI with richer output renderers and collaboration primitives

## License

MIT
