# syntax=docker/dockerfile:1.7
# Builds the SIGMA web client and serves it with nginx (proxying /api to the api service).
# Build from the repository root: docker build -f apps/web/Dockerfile -t sigma-web .
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
COPY tests/benchmarks/package.json ./tests/benchmarks/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @sigma/web... --config.allowBuilds.prisma=false --config.allowBuilds.@prisma/engines=false
RUN pnpm --filter @sigma/web build

FROM nginx:1.27-alpine AS runtime
COPY infrastructure/deployment/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
