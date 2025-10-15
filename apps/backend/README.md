# @nodebooks/server

Fastify-based application server that exposes the NodeBooks API, WebSocket services, and serves the bundled Next.js client.

## Usage

```bash
pnpm --filter @nodebooks/server build
NODE_ENV=production node dist/index.js
```

The package expects configuration to be provided through `@nodebooks/config` environment variables or the CLI-generated settings file.
