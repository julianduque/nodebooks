# NodeBooks

![NodeBooks Logo](./apps/client/public/assets/nodebooks-logo-64x64.png)

NodeBooks is a JS/TS notebook environment. It supports editing Markdown and code cells, executing TypeScript/JavaScript, and streaming outputs to the browser in real time.

## Features

- 📝 Edit Markdown and code cells
- ⚡ Run TypeScript/JavaScript in a sandboxed runtime
- 💻 Run collaborative terminal cells and commands
- 📡 Stream outputs to the browser in real time
- 📦 Install and use npm dependencies per notebook
- 🔐 Notebook-scoped environment variables
- 🧩 Rich display components (tables, charts, images, alerts)
- 💾 Persistence: SQLite (bundled) and PostgreSQL
- 🌍 Multi-user collaboration

## Project Layout

```
nodebooks/
├── apps/
│   ├── backend/              # @nodebooks/server – Fastify API with bundled Next.js client
│   ├── client/               # @nodebooks/client – Next.js 15 UI (Monaco-powered editor)
│   └── cli/                  # @nodebooks/cli – nbks command-line interface
├── packages/
│   ├── config/               # Shared config loaders and CLI helpers (builds to dist/)
│   ├── notebook-schema/      # Shared Zod models and notebook definitions (builds to dist/)
│   ├── runtime-host/         # Host utilities for coordinating runtimes (builds to dist/)
│   ├── runtime-node/         # Sandboxed Node.js runtime harness (builds to dist/)
│   ├── runtime-node-worker/  # Worker entrypoint for executing notebook cells (builds to dist/)
│   ├── runtime-protocol/     # Shared protocol definitions for runtime messaging (builds to dist/)
│   └── ui/                   # Reusable React UI components and styles
```

## Requirements

- Node 22+
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

## CLI (nbks)

The `@nodebooks/cli` workspace exposes an `nbks` binary for configuring and running the server locally. Once published it will also be installable via `npx nbks`, but you can exercise it in-repo today:

```bash
# Build the CLI (emits dist/index.js with the nbks entrypoint)
pnpm --filter @nodebooks/cli build

# Open the interactive config wizard to set persistence, theme, AI, admin user
pnpm --filter @nodebooks/cli exec nbks config

# Start the NodeBooks server using the saved config
pnpm --filter @nodebooks/cli exec nbks

# Reset the admin password (prompt for a value or auto-generate one)
pnpm --filter @nodebooks/cli exec nbks reset
```

- Configuration lives at `~/.config/nodebooks/nodebooks.toml` (respects `XDG_CONFIG_HOME` on Linux). The CLI keeps sensitive values (like passwords or API keys) out of source control.
- The default SQLite database path resolves to:
  - `~/Library/Application Support/nodebooks/nodebooks.sqlite` on macOS
  - `%APPDATA%\nodebooks\data\nodebooks.sqlite` on Windows
  - `$XDG_DATA_HOME/nodebooks/nodebooks.sqlite` (or `~/.local/share/nodebooks/nodebooks.sqlite`) on Linux
- When you run `nbks`, it synchronizes the admin user defined in the config with the chosen persistence store before launching `@nodebooks/server`.

## Accounts & Invitations

- When the server starts with no users, visit `/signup` to create the initial admin account.
- Admins can open the share dialog (the “Invite” button in any notebook) to send role-based invitations.
- Invitations generate signup tokens; recipients redeem them at `/signup?token=...` to choose a password before logging in.

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
- `NODEBOOKS_SQLITE_PATH` – Path to the SQLite file for notebooks storage.
- `NODEBOOKS_KERNEL_TIMEOUT_MS` – Kernel execution timeout in ms (default `10000`).
- `NODEBOOKS_KERNEL_WS_HEARTBEAT_MS` – Server→client WebSocket ping interval in ms to keep connections alive behind proxies with idle timeouts (default `25000`).
- `NODEBOOKS_THEME` – Theme to use for the UI (default `light`). Supported values:
  - `light` – Light theme.
  - `dark` – Dark theme.
- `NODEBOOKS_PERSISTENCE` – Notebook persistence driver (`sqlite` default). Supported values:
  - `sqlite` – Persist notebooks to the bundled `sql.js` database file.
  - `postgres` – Use PostgreSQL via `DATABASE_URL`.
  - `in-memory` – Ephemeral storage useful for local smoke tests.
- `DATABASE_URL` – PostgreSQL connection string used when `NODEBOOKS_PERSISTENCE=postgres`.

## Docker

- Build image: `docker build -t nodebooks:latest .`
- Run (SQLite, ephemeral): `docker run --rm -p 4000:4000 nodebooks:latest`
- Run (SQLite, persistent): `docker run --rm -p 4000:4000 -v nodebooks_data:/app/apps/backend/data nodebooks:latest`
- Run (PostgreSQL): `docker run --rm -p 4000:4000 -e NODEBOOKS_PERSISTENCE=postgres -e DATABASE_URL=postgres://user:pass@host:5432/db nodebooks:latest`
- Health check: `curl http://localhost:4000/health` returns `{ "status": "ok" }`

## Deploy to Heroku

- One-click deployment:

  [![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/julianduque/nodebooks)

- Or manually:
  - Create an app: `heroku create`
  - Add PostgreSQL addon: `heroku addons:create heroku-postgresql:essential-0`
  - Set env:
    - `heroku config:set NODEBOOKS_PERSISTENCE=postgres`
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
