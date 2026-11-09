# Operations

## Stack

`docker compose --env-file .env.docker up -d --build` starts `web` (nginx serving the client and
proxying `/api`), `api`, `postgres` and `redis`. Uploaded assets live in the `api-data` volume
(`DATA_DIR=/data`), or in an S3-compatible bucket when `S3_BUCKET`, `S3_ENDPOINT`,
`S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` are set.

## Ports and public URL

`WEB_PORT` chooses the published port (default 3387). `PUBLIC_URL` must be the address users type
into the browser (scheme, host and port) because it is the CORS allow-list entry and the base of
share-link URLs; requests arriving at the stack's own host and port are always accepted as
same-origin, so a mismatch only affects links and cross-origin API clients.

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

## Desktop app

SIGMA Desktop runs the same server inside the application with its own PostgreSQL; no Docker.

- **Data folder** (menu → Open data folder): `pgdata/` (database), `assets/` (uploads),
  `config.json` (port, sharing, secrets protected by the system keychain), `sigma.log`.
  Linux `~/.config/SIGMA`, macOS `~/Library/Application Support/SIGMA`, Windows
  `%APPDATA%\SIGMA`.
- **Sharing**: menu → Share on this network binds the app to all interfaces and shows the link
  (`http://<this-computer>:3387`). Create accounts for teammates under Users. The computer must
  stay on, and the firewall must allow the port.
- **Backup**: menu → Back up now… copies the database and uploads into a dated folder (the app
  pauses for a moment). Menu → Restore from backup… replaces the current data with a backup; the
  previous data is moved to a `before-restore-<time>` folder inside the data folder.
- **Forgotten password**: menu → Reset password… sets a new password for the owner (or the
  account whose email you enter) and signs that account out everywhere. It only works in the app
  window on the computer running SIGMA; the API refuses the request without a secret that only
  the app holds.
- **Port**: 3387 by default; if it is taken the app picks a free one for that run.
- **Moving to a server later**: the desktop database is ordinary PostgreSQL; dump it with
  `pg_dump` from any PostgreSQL 17+ client while the app runs and restore it into the Docker
  stack (`scripts/restore.sh`).
- **Building**: `pnpm desktop:build` on the target operating system; signing uses the standard
  electron-builder variables (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, …) when present.
