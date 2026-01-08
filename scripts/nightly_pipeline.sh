#!/usr/bin/env bash
set -euo pipefail

cd /home/troy/apps/legendary-collectibles-final

# Find node reliably (cron/PM2 safe)
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" && -x "$HOME/.nvm/versions/node/v22.21.1/bin/node" ]]; then
  NODE_BIN="$HOME/.nvm/versions/node/v22.21.1/bin/node"
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "ERROR: node not found. PATH=$PATH"
  exit 127
fi

# Load .env safely (avoid crashes on $ in secrets)
set +u
set -a
source .env
set +a
set -u

LOG_DIR="/home/troy/apps/legendary-collectibles-final/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/nightly_pipeline_$(date -u +%F).log"

{
  echo "=== NIGHTLY PIPELINE START (UTC $(date -u)) ==="
  echo "pwd=$(pwd)"
  echo "node=$NODE_BIN"
  "$NODE_BIN" -v
  echo ""

  echo "[1/8] pokemontcg_prices_incremental"
  "$NODE_BIN" scripts/pokemontcg/pokemontcg_prices_incremental.mjs
  echo ""

  echo "[2/8] scryfall_bulk_cards_sync"
  "$NODE_BIN" scripts/scryfall/scryfall_bulk_cards_sync.mjs
  echo ""

  echo "[3/8] tcgdex_variant_prices_sync (concurrency 8)"
  "$NODE_BIN" scripts/tcgdex/tcgdex_variant_prices_sync.mjs --concurrency 8
  echo ""

  echo "[4/8] syncYgoFromYGOPRODeck"
  "$NODE_BIN" scripts/ygo/syncYgoFromYGOPRODeck.mjs
  echo ""

  echo "[5/8] normalize scryfall prices"
  "$NODE_BIN" scripts/pricing/02_normalize_scryfall_prices.js
  echo ""

  echo "[6/8] normalize pokemon vendor prices"
  "$NODE_BIN" scripts/pricing/04_normalize_pokemon_vendor_prices.js
  echo ""

  echo "[7/8] normalize pokemon current vendor prices"
  "$NODE_BIN" scripts/pricing/04b_normalize_pokemon_current_vendor_prices.js
  echo ""

  echo "[8/8] build market price daily (USD)"
  "$NODE_BIN" scripts/pricing/03_build_market_price_daily.js --date "$(date -u +%F)" --currency USD
  echo ""

  echo "=== NIGHTLY PIPELINE END (UTC $(date -u)) ==="

  echo "[9/9] rollup market values daily"
"$NODE_BIN" scripts/pricing/10_rollup_market_values_daily.mjs
echo ""

  echo "[X] seed market comps (pokemon vendor history)"
"$NODE_BIN" scripts/market/01_seed_market_sales_comps_pokemon_from_vendor_history.mjs --days 180
echo ""

echo "[X] rollup market values daily"
"$NODE_BIN" scripts/pricing/10_rollup_market_values_daily.mjs
echo ""

} >> "$LOG_FILE" 2>&1

