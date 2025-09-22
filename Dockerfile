# syntax=docker/dockerfile:1.7
FROM node:22-bullseye-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/
COPY apps/client/package.json apps/client/
COPY packages/notebook-schema/package.json packages/notebook-schema/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

EXPOSE 4000

CMD ["pnpm", "--filter", "@nodebooks/api", "start"]
