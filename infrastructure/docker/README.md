# Local infrastructure

Docker Compose stack with the services the Sigma API depends on in development.

| Service      | Image                | Ports          | Credentials                                |
| ------------ | -------------------- | -------------- | ------------------------------------------ |
| `postgres`   | `postgres:17-alpine` | `5432`         | db `sigma`, user `sigma`, password `sigma` |
| `redis`      | `redis:7-alpine`     | `6379`         | none                                       |
| `minio`      | `minio/minio`        | `9000`, `9001` | user `sigma`, password `sigmasecret`       |
| `minio-init` | `minio/mc`           | –              | one-shot: creates bucket `sigma-assets`    |

These values match `apps/api/.env.example` (`DATABASE_URL`, `REDIS_URL`, `S3_*`).

## Run

From the repository root:

```sh
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

Then apply the database migrations and start the API:

```sh
cp apps/api/.env.example apps/api/.env
pnpm --filter @sigma/api prisma:migrate
pnpm --filter @sigma/api dev
```

- MinIO console: http://localhost:9001 (login `sigma` / `sigmasecret`).
- The `minio-init` container exits with code 0 after creating the bucket; that is expected.

## Stop

```sh
docker compose -f infrastructure/docker/docker-compose.yml down        # keep data
docker compose -f infrastructure/docker/docker-compose.yml down -v     # also delete volumes
```

## Validate the file without starting anything

```sh
docker compose -f infrastructure/docker/docker-compose.yml config
```
