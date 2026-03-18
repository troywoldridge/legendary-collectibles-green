#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/home/troy/.config/legendary/tcgdex.env}"
OUT_DIR="${OUT_DIR:-/home/troy/apps/legendary-collectibles-green/exports}"
RUN_DATE_UTC="${RUN_DATE_UTC:-$(date -u +%F)}"
OUT_FILE="${OUT_FILE:-$OUT_DIR/tcgdex_no_price_${RUN_DATE_UTC}.csv}"

mkdir -p "$OUT_DIR"

# Load env (PG* vars for psql, plus DB_* for php if needed)
set -a
source "$ENV_FILE"
set +a

echo "[export] date(UTC)=$RUN_DATE_UTC"
echo "[export] out=$OUT_FILE"

# Cards with NO USD snapshot for today.
# Also tries to include a name and set name from tcgdex_cards.raw_json if available.
psql -v ON_ERROR_STOP=1 -c "\copy (
  with today as (
    select ('$RUN_DATE_UTC'::date) as d
  ),
  tcgdex as (
    select
      c.id::text as card_id,
      nullif(c.raw_json->>'name','') as name,
      nullif(c.raw_json->'set'->>'name','') as set_name
    from public.tcgdex_cards c
  ),
  todays_usd as (
    select s.card_id::text as card_id
    from public.tcgdex_price_snapshots_daily s
    join today on true
    where s.as_of_date = today.d
      and s.currency = 'USD'
  )
  select
    t.card_id,
    t.name,
    t.set_name
  from tcgdex t
  left join todays_usd u on u.card_id = t.card_id
  where u.card_id is null
  order by t.set_name nulls last, t.name nulls last, t.card_id
) to '$OUT_FILE' with csv header"

echo "[export] done"
