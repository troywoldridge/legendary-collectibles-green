#!/usr/bin/env bash
set -euo pipefail
mkdir -p logs
export LOAD_DB=${LOAD_DB:-true}
export RESET_DB=${RESET_DB:-false}
export SCRYFALL_BULK=${SCRYFALL_BULK:-default_cards}

while true; do
  echo "=== $(date -Iseconds) starting sync ===" | tee -a logs/scryfall-sync.log
  stdbuf -oL -eL node scripts/scryfallSyncAll.mjs | tee -a logs/scryfall-sync.log
  code=${PIPESTATUS[0]}
  if [[ $code -eq 0 ]]; then
    echo "=== $(date -Iseconds) sync finished OK ===" | tee -a logs/scryfall-sync.log
    exit 0
  fi
  echo "=== $(date -Iseconds) sync crashed (code $code). Restarting in 15s… ===" | tee -a logs/scryfall-sync.log
  sleep 15
done
