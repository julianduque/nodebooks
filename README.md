# NodeBooks Product Site

Static marketing site for **NodeBooks – Interactive Node.js Notebooks**. The site is built with Next.js (App Router), Tailwind CSS, and shadcn/ui primitives, and ships as a static export hosted from the `gh-docs` branch on GitHub Pages at https://julianduque.github.io/nodebooks/.

## Requirements

- Node.js 22.6+
- pnpm 10 (or another package manager)

## Install & Develop

```bash
pnpm install
pnpm dev
```

The dev server runs at http://localhost:3000 with hot reload enabled.

## Build & Preview

```bash
pnpm build
pnpm start
```

`next build` generates the static site under `.next/`; `next start` serves the pre-rendered output for inspection (available at `http://localhost:3000/nodebooks` because of the GitHub Pages base path).

## Static Export

```bash
pnpm export
```

The export command places deployable static assets in `out/` (including a `.nojekyll` marker required by GitHub Pages).

## Publish to `gh-docs`

1. Ensure the `gh-docs` worktree is available locally. If not:

   ```bash
   git worktree add ../gh-docs gh-docs
   ```

2. Build the static site:

   ```bash
   pnpm export
   ```

3. Copy the `out/` contents into the `gh-docs` worktree, commit, and push:

   ```bash
   rsync -av --delete out/ ../gh-docs/
   cd ../gh-docs
   git add .
   git commit -m "Publish updated docs site"
   git push origin gh-docs
   ```
