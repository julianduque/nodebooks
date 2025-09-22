# Repository Guidelines

## Environment & Tooling

Use `pnpm@10` (declared in `package.json`) to install dependencies across the monorepo. Run `pnpm install` from the repo root before touching workspace packages. Node 20+ ensures compatibility with Fastify, Next.js 15, and Vitest. Keep `.env` variables local; never commit real credentials.

## Project Structure & Module Organization

`apps/backend` hosts the Fastify backend (`src/` for handlers, `data/` for the bundled SQLite file, `tsconfig.json` for build output). `apps/client` is the Next.js frontend (`app/` routes, `components/`, and `tests/`). `packages/notebook-schema` centralizes shared Zod models consumed by both apps. Cross-workspace imports must reference the `@nodebooks/*` package aliases.

## Build, Test, and Development Commands

`pnpm dev` runs all workspaces in watch mode (Fastify via `tsx`, Next.js via `next dev`). Use `pnpm --filter @nodebooks/api dev` or `pnpm --filter @nodebooks/ui dev` when you only need one surface. `pnpm build` compiles every package; `pnpm lint` runs ESLint with the repo config; `pnpm test` executes Vitest in each workspace. Code formatting is handled by Prettier via `pnpm format` (write) and `pnpm format:check` (verify only).

## Coding Style & Naming Conventions

TypeScript with ES modules is the default; keep files as `.ts`/`.tsx`. Favor 2-space indentation and double quotes to match existing code. Prettier is configured at the repo root (`.prettierrc`) with `.prettierignore` excluding build output and `apps/backend/data`; run `pnpm format` before committing. Import types using `import type` (ESLint enforces `@typescript-eslint/consistent-type-imports`). Name React components in `PascalCase`, utility modules in `camelCase`, and tests as `*.test.ts[x]`.

## Testing Guidelines

Vitest is configured per workspace (Node environment for backend and schema, JSDOM for the UI). Place backend and schema tests alongside code in `src/**/*.test.ts`; UI smoke and component tests live under `apps/client/tests/`. Run focused suites with `pnpm --filter <workspace> test`. When adding logic, extend coverage by asserting error paths and WebSocket interactions; prefer deterministic fixtures over the bundled SQLite file.

## Commit & Pull Request Guidelines

Follow Conventional Commit prefixes (`feat`, `fix`, `chore`, etc.) as seen in `git log` (e.g., `feat: add sqlite persistence`). Keep summaries under 72 characters and mention the touched workspace. PRs should describe scope, list manual/automated tests (`pnpm test`, lint, dev checks), and link tracking issues. Include screenshots or terminal output whenever the UI or API response changes.
