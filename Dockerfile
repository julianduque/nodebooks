# syntax=docker/dockerfile:1.7
FROM node:22-bullseye-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/ui/package.json apps/ui/
COPY packages/notebook-schema/package.json packages/notebook-schema/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

EXPOSE 3000 4000

CMD ["pnpm", "dev"]
