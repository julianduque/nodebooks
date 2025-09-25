# NodeBooks

NodeBooks is an experimental JS/TS notebook environment that pairs a Fastify API with a Next.js UI. It supports editing Markdown and code cells, executing TypeScript/JavaScript, and streaming outputs to the browser in real time.

## Project Layout

```
nodebooks/
├── apps/
│   ├── backend/           # @nodebooks/server – Fastify 5 API + optional embedded Next.js
│   └── client/            # @nodebooks/client – Next.js 15 UI (Monaco-powered editor)
├── packages/
│   ├── notebook-schema/   # Shared Zod models + kernel protocol (built to dist/, exported via package.exports)
│   ├── runtime-node/      # Runtime environment for notebook execution (built to dist/, exported via package.exports)
│   └── notebook-ui/       # Reusable React UI pieces for notebook displays
├── content/               # Templates and notebooks
├── package.json           # pnpm workspace config and root scripts
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Requirements

- Node 20+
- pnpm 10 (Corepack-enabled Node images work out of the box)

## Install

```bash
pnpm install
```

## Development

- Single-port dev (Fastify serves the Next.js UI):
  - `pnpm dev`
  - App: http://localhost:4000

- API-only + separate Next.js dev (two terminals):
  - Terminal 1 (API): `pnpm api:dev` (Fastify on http://localhost:4000)
  - Terminal 2 (UI): `pnpm ui:dev` (Next.js on http://localhost:3000)
  - The UI dev script is preconfigured with `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api`.

## Production

Build all workspaces, then start the server in production mode:

```bash
pnpm -w build
pnpm start
```

- Server listens on `HOST` (default `0.0.0.0`) and `PORT` (default `4000`).
- The backend serves the built Next.js UI by default (`EMBED_NEXT=true`).

### Environment Variables

- `PORT` – Port to bind (default `4000`).
- `HOST` – Host to bind (default `0.0.0.0`).
- `NODEBOOKS_PASSWORD` – Password to protect the server (default `null`).
- `NODEBOOKS_SQLITE_PATH` – Path to the SQLite file for notebooks storage (defaults to `apps/backend/data/nodebooks.sqlite`).
- `NODEBOOKS_KERNEL_TIMEOUT_MS` – Kernel execution timeout in ms (default `10000`).
- `NODEBOOKS_THEME` – Theme to use for the UI (default `light`). Supported values:
  - `light` – Light theme.
  - `dark` – Dark theme.
- `NODEBOOKS_PERSISTENCE` – Notebook persistence driver (`sqlite` default). Supported values:
  - `sqlite` – Persist notebooks to the bundled `sql.js` database file.
  - `postgres` – Use PostgreSQL via `DATABASE_URL`.
  - `in-memory` – Ephemeral storage useful for local smoke tests.
- `DATABASE_URL` – PostgreSQL connection string used when `NODEBOOKS_PERSISTENCE=postgres`.
- `KERNEL_WS_HEARTBEAT_MS` – Server→client WebSocket ping interval in ms to keep
  connections alive behind proxies with idle timeouts (default `25000`).

## Testing & Quality

```bash
pnpm lint           # ESLint across workspaces
pnpm test           # Vitest across workspaces
pnpm format         # Prettier write
pnpm format:check   # Prettier verify only
```

- Backend and schema tests live alongside code under `src/**/*.test.ts`.
- UI tests live under `apps/client/tests/` (JSDOM).

## Notes

- Cross-workspace imports use the `@nodebooks/*` aliases.
- The shared `@nodebooks/notebook-schema` package builds to `dist/` and is consumed as compiled ESM at runtime.
- The Notebooks uses the `@nodebooks/notebook-ui` package for components and displays.
- The Notebooks uses the `@nodebooks/runtime-node` package for the Node.js runtime environment.

## License

MIT
