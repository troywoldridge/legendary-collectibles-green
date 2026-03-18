#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/troy/apps/legendary-collectibles-green"
ENV_FILE="/home/troy/.config/legendary/tcgdex.env"
PHP_BIN="php"
SCRIPT_REL="scripts/tcgdex/daily_tcgdex_sync.php"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[tcgdex] ERROR: env file missing: $ENV_FILE" >&2
  exit 1
fi

# Load env vars (DB_USER/DB_PASS/DB_DSN or DATABASE_URL if you use it elsewhere)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# 24-hour cycle: 288 five-minute slots per day
export SHARD_TOTAL="288"

# Pick shard by current UTC time so it doesn't drift with DST
HH="$(date -u +%H)"
MM="$(date -u +%M)"
MIN_SINCE=$((10#$HH * 60 + 10#$MM))
export SHARD_INDEX=$((MIN_SINCE / 5))  # 0..287

# No cap (sharding controls the slice size)
export MAX_CARDS="0"

# Be polite to API + keep runtime predictable
export SLEEP_MS="35"

# Avoid spammy progress in logs (each run is small anyway)
export PROGRESS_EVERY="0"

cd "$APP_DIR"

START="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "[tcgdex] START utc=$START shard=${SHARD_INDEX}/${SHARD_TOTAL} sleepMs=${SLEEP_MS} maxCards=${MAX_CARDS}"

# Run
"$PHP_BIN" "$SCRIPT_REL"

END="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "[tcgdex] DONE  utc=$END shard=${SHARD_INDEX}/${SHARD_TOTAL}"
