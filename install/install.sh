#!/usr/bin/env sh
# SIGMA installer for macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/atreyakamat/sigma/main/install/install.sh | sh
# Needs Docker Desktop (or Docker Engine with the Compose plugin). Installs into ~/sigma,
# starts SIGMA, and writes your sign-in details to ~/sigma/SIGMA-LOGIN.txt.
# Options (environment variables): SIGMA_DIR, SIGMA_PORT, SIGMA_VERSION, SIGMA_COMPOSE_URL.
set -eu

DIR="${SIGMA_DIR:-$HOME/sigma}"
PORT="${SIGMA_PORT:-3387}"
VERSION="${SIGMA_VERSION:-latest}"
COMPOSE_URL="${SIGMA_COMPOSE_URL:-https://raw.githubusercontent.com/atreyakamat/sigma/main/install/docker-compose.yml}"
URL="http://localhost:$PORT"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$1" >&2; exit 1; }
secret() { LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$1"; }

say "Installing SIGMA into $DIR"

command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install Docker Desktop from https://www.docker.com/products/docker-desktop/ , start it, then run this installer again."
docker info >/dev/null 2>&1 || fail "Docker is installed but not running. Start Docker Desktop, wait until it says it is running, then run this installer again."
docker compose version >/dev/null 2>&1 || fail "Docker Compose is missing. Update Docker Desktop (or install the docker-compose-plugin package) and try again."

mkdir -p "$DIR"
cd "$DIR"

if [ -f "$COMPOSE_URL" ]; then cp "$COMPOSE_URL" docker-compose.yml
elif command -v curl >/dev/null 2>&1; then curl -fsSL "$COMPOSE_URL" -o docker-compose.yml
elif command -v wget >/dev/null 2>&1; then wget -qO docker-compose.yml "$COMPOSE_URL"
else fail "Neither curl nor wget is available to download SIGMA."; fi

if [ ! -f .env ]; then
  ADMIN_PASSWORD="$(secret 6)-$(secret 6)-$(secret 6)"
  cat > .env <<ENV
# SIGMA settings. Change WEB_PORT and PUBLIC_URL together if you need another port.
WEB_PORT=$PORT
PUBLIC_URL=$URL
SIGMA_VERSION=$VERSION
SESSION_SECRET=$(secret 48)
POSTGRES_PASSWORD=$(secret 32)
BOOTSTRAP_ADMIN_EMAIL=admin@sigma.local
BOOTSTRAP_ADMIN_PASSWORD=$ADMIN_PASSWORD
ENV
  chmod 600 .env
  cat > SIGMA-LOGIN.txt <<LOGIN
SIGMA is installed on this computer.

Open:      $URL
Email:     admin@sigma.local
Password:  $ADMIN_PASSWORD

Keep this file private. You can change the password after signing in
(account menu → Change password), then delete this file.
LOGIN
  chmod 600 SIGMA-LOGIN.txt
else
  say "Existing settings found; keeping them (this is an update)."
  PORT="$(grep '^WEB_PORT=' .env | cut -d= -f2)"; URL="http://localhost:$PORT"
fi

launcher() { # name, body
  printf '#!/usr/bin/env sh\ncd "$(dirname "$0")" || exit 1\n%s\n' "$2" > "$1"
  chmod +x "$1"
}
OPEN='if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true; fi'
START_BODY="URL=\"$URL\"
docker info >/dev/null 2>&1 || { echo 'Start Docker Desktop first, then run this again.'; exit 1; }
docker compose up -d --no-build && echo \"SIGMA is running at \$URL\" && $OPEN"
STOP_BODY='docker compose down && echo "SIGMA is stopped. Your files are kept."'
UPDATE_BODY='docker compose pull && docker compose up -d --no-build && echo "SIGMA is up to date."'
BACKUP_BODY='OUT="backups/sigma-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$OUT"
docker compose exec -T postgres pg_dump -U sigma -d sigma --format=custom > "$OUT/database.dump"
docker compose exec -T api sh -c "cd /data && tar -cf - ." > "$OUT/assets.tar"
echo "Backup saved in $(pwd)/$OUT"'
for ext in sh command; do
  launcher "start-sigma.$ext" "$START_BODY"
  launcher "stop-sigma.$ext" "$STOP_BODY"
  launcher "update-sigma.$ext" "$UPDATE_BODY"
  launcher "backup-sigma.$ext" "$BACKUP_BODY"
done

say "Downloading SIGMA (this can take a few minutes the first time)…"
n=1
until docker compose pull; do
  if [ "$n" -ge 3 ]; then
    echo "The download did not complete after 3 tries; starting with what is already on this computer."
    break
  fi
  n=$((n + 1))
  echo "Download interrupted; trying again ($n of 3)…"
  sleep 5
done
say "Starting SIGMA…"
docker compose up -d --no-build || fail "SIGMA could not start, most likely because the download did not finish. Check your internet connection and run this installer again; it continues where it stopped."

printf 'Waiting for SIGMA to be ready'
i=0
until curl -fsS "$URL/api/v1/health" >/dev/null 2>&1 || wget -qO- "$URL/api/v1/health" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 90 ] && fail "SIGMA did not start in time. Run 'docker compose logs' in $DIR to see why."
  printf '.'
  sleep 2
done
printf '\n'

say "SIGMA is ready: $URL"
[ -f SIGMA-LOGIN.txt ] && { echo; cat SIGMA-LOGIN.txt; }
echo
echo "Next time: double-click start-sigma (in $DIR) to start, stop-sigma to stop, update-sigma to update."
if [ -z "${SIGMA_NO_OPEN:-}" ]; then
  if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true; fi
fi
