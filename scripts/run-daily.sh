#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root from this script's location
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

# Load .env if present (export variables)
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

# Logs
LOG_DIR="${LOG_DIR:-$ROOT/logs/daily}"
mkdir -p "$LOG_DIR"
NOW="$(date '+%Y-%m-%d_%H-%M-%S')"
LOG_FILE="$LOG_DIR/daily-$NOW.log"

# Send ALL output to log + screen (no repeated tee calls)
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== Legendary Collectibles - Daily Run ($NOW) ==="
echo "ROOT: $ROOT"
echo "PWD:  $(pwd)"
echo "Node: $(node -v)"
echo "Log:  $LOG_FILE"
echo

# Hard requirement for DB scripts
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL not set."
  echo "Fix: add DATABASE_URL to $ROOT/.env (or export it in the shell) and re-run."
  exit 1
fi

run_step () {
  local label="$1"
  shift
  echo ">>> $label"
  "$@"
  echo
}

# ---------- Data sync ----------
# Pokemon + YGO are usually safe daily.
run_step "pokemonSyncAll"          node scripts/pokemon/pokemonSyncAll.mjs
run_step "syncYgoFromYGOPRODeck"   node scripts/ygo/syncYgoFromYGOPRODeck.mjs

# MTG / Scryfall full card sync is OPTIONAL (heavy) and requires a query.
# Enable by setting in .env:
#   SCRYFALL_SYNC=1
#   SCRYFALL_QUERY='game:paper'   (or a narrower query Troy provides)
if [[ "${SCRYFALL_SYNC:-0}" == "1" ]]; then
  if [[ -z "${SCRYFALL_QUERY:-}" ]]; then
 echo "❌ SCRYFALL_SYNC=1 but SCRYFALL_QUERY is not set. Skipping MTG sync."
    echo "   Fix: set SCRYFALL_QUERY in .env (Troy will provide the right query)."
    echo
  else
    # IMPORTANT: scryfall_cards.js does NOT have an 'upsert' command.
    # It upserts automatically unless you pass --no-db.
    run_step "scryfall_cards search (DB upsert)" node scripts/scryfall/scryfall_cards.js search --q "$SCRYFALL_QUERY" --delay "${SCRYFALL_DELAY_MS:-120}"
  fi
fi

# ---------- Pricing pipeline ----------
run_step "normalize_scryfall"      node scripts/pricing/02_normalize_scryfall_prices.js
run_step "market_price_daily"      node scripts/pricing/03_build_market_price_daily.js
run_step "market_prices_current"   node scripts/pricing/05_build_market_prices_current.js

# ---------- Collection valuation ----------
run_step "revalueCollection"       node scripts/revalueCollection.mjs

# ---------- Alerts ----------
# runPriceAlerts currently runs but scanPriceAlerts + email sender are not fully wired in on your server.
# Leave alerts off by default for employee runs.
if [[ "${PRICE_ALERTS:-0}" == "1" ]]; then
  run_step "runPriceAlerts" node scripts/runPriceAlerts.mjs
fi

echo "=== DONE (OK) ==="
echo "Log: $LOG_FILE"
