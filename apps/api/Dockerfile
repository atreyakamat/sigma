# syntax=docker/dockerfile:1.7
# SIGMA API image. Build from the repository root: docker build -f apps/api/Dockerfile -t sigma-api .
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/web/package.json ./apps/web/package.json
COPY tests/benchmarks/package.json ./tests/benchmarks/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @sigma/api...
RUN pnpm --filter @sigma/api build \
 && pnpm --filter @sigma/api --prod deploy --legacy /out

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S sigma && adduser -S sigma -G sigma
COPY --from=build --chown=sigma:sigma /out/node_modules ./node_modules
COPY --from=build --chown=sigma:sigma /out/package.json ./package.json
COPY --from=build --chown=sigma:sigma /out/dist ./dist
COPY --from=build --chown=sigma:sigma /out/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build --chown=sigma:sigma /out/prisma/migrations ./prisma/migrations
COPY --from=build --chown=sigma:sigma /out/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=sigma:sigma /out/docker-entrypoint.sh ./docker-entrypoint.sh
USER sigma
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -qO- http://127.0.0.1:4000/api/v1/health >/dev/null || exit 1
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
