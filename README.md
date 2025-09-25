# NodeBooks

NodeBooks is a JS/TS notebook environment. It supports editing Markdown and code cells, executing TypeScript/JavaScript, and streaming outputs to the browser in real time.

## Features

- 📝 Edit Markdown and code cells
- ⚡ Run TypeScript/JavaScript in a sandboxed runtime
- 📡 Stream outputs to the browser in real time
- 📦 Install and use npm dependencies per notebook
- 🔐 Notebook-scoped environment variables
- 🧩 Rich display components (tables, charts, images, alerts)
- 💾 Persistence: SQLite (bundled) and PostgreSQL
- 🔁 Live kernel over WebSockets with heartbeats
- 🧪 Vitest across workspaces, ESLint + Prettier
- 🧰 Monorepo via PNPM workspaces

## Project Layout

```
nodebooks/
├── apps/
│   ├── backend/              # @nodebooks/server – Fastify 5 API + optional embedded Next.js
│   └── client/               # @nodebooks/client – Next.js 15 UI (Monaco-powered editor)
├── packages/
│   ├── notebook-schema/      # Shared Zod models + kernel protocol (built to dist/, exported via package.exports)
│   ├── runtime-node/         # Runtime environment for notebook execution (built to dist/, exported via package.exports)
│   ├── runtime-host/         # Runtime environment for notebook execution (built to dist/, exported via package.exports)
│   ├── runtime-protocol/     # Runtime protocol for notebook execution (built to dist/, exported via package.exports)
│   ├── runtime-node-worker/  # Runtime environment for notebook execution (built to dist/, exported via package.exports)
│   ├── config/               # Shared config for server and client (built to dist/, exported via package.exports)
│   └── notebook-ui/          # Reusable React UI pieces for notebook displays
└── content/                  # Templates and notebooks
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
- The backend serves the built Next.js UI by default.

### Environment Variables

- `PORT` – Port to bind (default `4000`).
- `HOST` – Host to bind (default `0.0.0.0`).
- `NODEBOOKS_PASSWORD` – Password to protect the server (default `null`).
- `NODEBOOKS_SQLITE_PATH` – Path to the SQLite file for notebooks storage.
- `NODEBOOKS_KERNEL_TIMEOUT_MS` – Kernel execution timeout in ms (default `10000`).
- `NODEBOOKS_THEME` – Theme to use for the UI (default `light`). Supported values:
  - `light` – Light theme.
  - `dark` – Dark theme.
- `NODEBOOKS_PERSISTENCE` – Notebook persistence driver (`sqlite` default). Supported values:
  - `sqlite` – Persist notebooks to the bundled `sql.js` database file.
  - `postgres` – Use PostgreSQL via `DATABASE_URL`.
  - `in-memory` – Ephemeral storage useful for local smoke tests.
- `DATABASE_URL` – PostgreSQL connection string used when `NODEBOOKS_PERSISTENCE=postgres`.
- `KERNEL_WS_HEARTBEAT_MS` – Server→client WebSocket ping interval in ms to keep connections alive behind proxies with idle timeouts (default `25000`).

## Docker

- Build image: `docker build -t nodebooks:latest .`
- Run (SQLite, ephemeral): `docker run --rm -p 4000:4000 nodebooks:latest`
- Run (SQLite, persistent): `docker run --rm -p 4000:4000 -v nodebooks_data:/app/apps/backend/data nodebooks:latest`
- Run (PostgreSQL): `docker run --rm -p 4000:4000 -e NODEBOOKS_PERSISTENCE=postgres -e DATABASE_URL=postgres://user:pass@host:5432/db nodebooks:latest`
- Optional password: add `-e NODEBOOKS_PASSWORD=your-secret` to require login
- Health check: `curl http://localhost:4000/health` returns `{ "status": "ok" }`

## Deploy to Heroku

- One-click deployment:

  [![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/julianduque/nodebooks)

- Or manually:
  - Create an app: `heroku create`
  - Add PostgreSQL addon: `heroku addons:create heroku-postgresql:essential-0`
  - Set env:
    - `heroku config:set NODEBOOKS_PERSISTENCE=postgres`
    - `heroku config:set NODEBOOKS_PASSWORD=your-secret`
  - Push: `git push heroku HEAD:main` (or your default branch)
  - Open: `heroku open`

The repo includes `app.json` and `Procfile` for Heroku. The Node.js buildpack installs PNPM via Corepack, runs the monorepo build, and starts the Fastify server (`pnpm start`).

## Testing & Quality

```bash
pnpm lint           # ESLint across workspaces
pnpm test           # Vitest across workspaces
pnpm format         # Prettier write
pnpm format:check   # Prettier verify only
```

## License

MIT
