# syntax=docker/dockerfile:1.7
FROM node:22-bullseye-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV PNPM_STORE_DIR=/pnpm/store
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable

WORKDIR /app

# Install dependencies with maximal Docker layer caching
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml ./

# Workspace manifests for better cache reuse
COPY apps/backend/package.json apps/backend/
COPY apps/client/package.json apps/client/
COPY packages/notebook-schema/package.json packages/notebook-schema/
COPY packages/ui/package.json packages/ui/
COPY packages/runtime-host/package.json packages/runtime-host/
COPY packages/runtime-node/package.json packages/runtime-node/
COPY packages/runtime-node-worker/package.json packages/runtime-node-worker/
COPY packages/runtime-protocol/package.json packages/runtime-protocol/
COPY packages/config/package.json packages/config/

RUN pnpm install --frozen-lockfile

# Build all workspaces
COPY . .
RUN pnpm build

ENV NODE_ENV=production
EXPOSE 4000

# 3) Launch the Fastify server (serves API + Next.js client)
CMD ["pnpm", "--filter", "@nodebooks/server", "start"]
