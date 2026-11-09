# Operations

## Stack

`docker compose --env-file .env.docker up -d --build` starts `web` (nginx serving the client and
proxying `/api`), `api`, `postgres` and `redis`. Uploaded assets live in the `api-data` volume
(`DATA_DIR=/data`), or in an S3-compatible bucket when `S3_BUCKET`, `S3_ENDPOINT`,
`S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` are set.

## Installing from published images

Releases publish `ghcr.io/atreyakamat/sigma-web:<version>` and `ghcr.io/atreyakamat/sigma-api:<version>`.
Set `SIGMA_VERSION=<version>` in `.env.docker` (and `SIGMA_IMAGE_NAMESPACE` for another registry), then
`docker compose --env-file .env.docker pull && docker compose --env-file .env.docker up -d --no-build`.
Leave them unset to build from source.

## HTTPS

Set in `.env.docker`:

```
PUBLIC_HOST=design.example.com
PUBLIC_URL=https://design.example.com
COOKIE_SECURE=true
```

and start with `docker compose --env-file .env.docker --profile https up -d --build`. The `proxy`
service (Caddy) listens on 80/443, obtains a Let's Encrypt certificate for `PUBLIC_HOST`, renews
it, adds HSTS and forwards to `web`. For a LAN hostname or IP Caddy issues a self-signed
certificate; set `PUBLIC_HOST=localhost` for local testing. Any other TLS terminator works as long
as it forwards `Host`, `X-Forwarded-Proto` and WebSocket upgrades to `web:80`.

## Backups

```
scripts/backup.sh               # writes ./backups/sigma-<timestamp>/{database.dump,assets.tar}
scripts/restore.sh backups/sigma-<timestamp>
```

`backup.sh` runs `pg_dump --format=custom` inside the postgres container and archives `/data` from
the api container. `restore.sh` stops the API, runs `pg_restore --clean`, replaces the assets
volume and starts the API again. Schedule `backup.sh` from cron and copy the directory off the
host. Set `COMPOSE_ENV_FILE=.env.docker` if your compose project needs the env file.

## Monitoring

- `GET /api/v1/health` → `{ status, uptime, version, database }` (used by the container health
  check).
- `GET /api/v1/metrics` → Prometheus text format: request counts and durations by route and
  status.
- `docker compose logs api` shows structured Nest logs; realtime persistence failures are logged
  under `Collab`.

## Upgrades

Change `SIGMA_VERSION` and `docker compose pull && docker compose up -d --no-build` (published
images), or `docker compose --env-file .env.docker up -d --build` to rebuild from source; the API runs
`prisma migrate deploy` on start, so migrations apply automatically. Take a backup first.

## Realtime notes

Each API container keeps the open documents' CRDT rooms in memory and folds them into the database
after `COLLAB_PERSIST_DEBOUNCE_MS` (default 1000 ms). Run a single API instance; a second instance
would need sticky sessions (ADR-0012). A graceful shutdown flushes every open room.
