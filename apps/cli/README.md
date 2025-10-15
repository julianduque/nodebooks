# @nodebooks/cli

Command-line interface for installing and managing a self-hosted NodeBooks deployment.

## Installation

```bash
npm install -g @nodebooks/cli
# or
pnpm add -g @nodebooks/cli
# or run on demand
npx @nodebooks/cli --help
```

## Commands

- `nbks` / `nbks start` – Start the bundled `@nodebooks/server` with your saved configuration.
- `nbks config` – Run an interactive setup wizard to create or update the CLI configuration file.
- `nbks reset` – Reset the admin password, optionally generating a secure random value.
