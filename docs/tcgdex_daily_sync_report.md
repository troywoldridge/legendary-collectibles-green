# tcgdex Integration Retrieval Notes

## Step 1: Table Structure Retrieval (`legendary`)

> Environment note: direct Postgres access was not available in this runtime (`psql` missing and TCP to configured Neon Postgres unreachable), so metadata below is assembled from repository schema and SQL usage.

```json
{
  "tcgdex_cards": {
    "columns": [
      {"name": "id", "data_type": "text (inferred from SQL casts id::text)", "source": "query usage"},
      {"name": "raw_json", "data_type": "jsonb/object", "source": "query usage"}
    ],
    "primary_keys": ["id (inferred)"],
    "foreign_keys": [],
    "indexes": ["unknown (not discoverable offline)"]
  },
  "tcgdex_price_snapshots_daily": {
    "columns": [
      {"name": "card_id", "data_type": "text", "source": "INSERT query"},
      {"name": "as_of_date", "data_type": "date", "source": "INSERT query"},
      {"name": "currency", "data_type": "text", "source": "INSERT query"},
      {"name": "market_price_cents", "data_type": "integer", "source": "INSERT query"},
      {"name": "raw_json", "data_type": "jsonb", "source": "INSERT query"},
      {"name": "created_at", "data_type": "timestamp", "source": "INSERT query"},
      {"name": "updated_at", "data_type": "timestamp", "source": "INSERT query"}
    ],
    "primary_keys": ["(card_id, as_of_date, currency) via ON CONFLICT target"],
    "foreign_keys": [],
    "indexes": ["implied unique index on (card_id, as_of_date, currency)"]
  },
  "tcgdex_sets": {
    "columns": [],
    "primary_keys": [],
    "foreign_keys": [],
    "indexes": ["unknown (table not present in local schema files)"]
  },
  "tcg_cards": {
    "columns": [
      {"name": "id", "data_type": "text", "primary_key": true},
      {"name": "name", "data_type": "text"},
      {"name": "supertype", "data_type": "text"},
      {"name": "subtypes", "data_type": "text"},
      {"name": "level", "data_type": "text"},
      {"name": "hp", "data_type": "text"},
      {"name": "types", "data_type": "text"},
      {"name": "evolves_from", "data_type": "text"},
      {"name": "evolves_to", "data_type": "text"},
      {"name": "rules", "data_type": "text"},
      {"name": "ancient_trait_name", "data_type": "text"},
      {"name": "ancient_trait_text", "data_type": "text"},
      {"name": "converted_retreat_cost", "data_type": "text"},
      {"name": "retreat_cost", "data_type": "text"},
      {"name": "set_id", "data_type": "text"},
      {"name": "set_name", "data_type": "text"},
      {"name": "series", "data_type": "text"},
      {"name": "printed_total", "data_type": "text"},
      {"name": "total", "data_type": "text"},
      {"name": "ptcgo_code", "data_type": "text"},
      {"name": "release_date", "data_type": "text"},
      {"name": "set_updated_at", "data_type": "text"},
      {"name": "symbol_url", "data_type": "text"},
      {"name": "logo_url", "data_type": "text"},
      {"name": "regulation_mark", "data_type": "text"},
      {"name": "artist", "data_type": "text"},
      {"name": "rarity", "data_type": "text"},
      {"name": "flavor_text", "data_type": "text"},
      {"name": "national_pokedex_numbers", "data_type": "text"},
      {"name": "extra", "data_type": "text"},
      {"name": "small_image", "data_type": "text"},
      {"name": "large_image", "data_type": "text"},
      {"name": "tcgplayer_url", "data_type": "text"},
      {"name": "tcgplayer_updated_at", "data_type": "text"},
      {"name": "cardmarket_url", "data_type": "text"},
      {"name": "cardmarket_updated_at", "data_type": "text"}
    ],
    "primary_keys": ["id"],
    "foreign_keys": [],
    "indexes": ["primary key index on id (implied)"]
  }
}
```

## Step 2: Documentation Retrieval (tcgdex)

Network access to tcgdex docs was blocked in this environment, so the closest available references were extracted from project code comments and SQL behavior.

### Gathering all information

From `scripts/tcgdex_jp_sync.mjs`:

- The sync script stores both a summarized card row and full payload (`tcgdex_raw`) to preserve complete source data.
- It normalizes image assets from `assets.tcgdex.net` and maps fields into local tables.

```js
 * - tcg_cards (summary fields)
 * - tcgdex_raw (full payload)
```

### TCG market integration

From `src/app/api/cron/tcgdex/snapshots/route.ts`:

- Pricing extraction prioritizes `raw_json.pricing.tcgplayer` buckets (e.g., `normal`, `reverse-holofoil`, `holofoil`) and cardmarket aggregates (`trend`, `avg30`, etc.).
- Daily prices are written to `tcgdex_price_snapshots_daily` using an idempotent upsert keyed by `(card_id, as_of_date, currency)`.

```sql
INSERT INTO public.tcgdex_price_snapshots_daily (
  card_id, as_of_date, currency, market_price_cents, raw_json, created_at, updated_at
)
...
ON CONFLICT (card_id, as_of_date, currency)
DO UPDATE SET
  market_price_cents = EXCLUDED.market_price_cents,
  raw_json = EXCLUDED.raw_json,
  updated_at = now()
```

## Step 3/4 implementation pointer

Created script: `scripts/tcgdex/daily_tcgdex_sync.php` with test harness in `tests/tcgdex_daily_sync_test.php`.
