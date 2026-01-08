#!/usr/bin/env node
/* eslint-disable no-console */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

const SLEEP_MS = Number(process.env.REVALUE_WORKER_SLEEP_MS || 2000);
const MAX_ITEMS_PER_JOB = Number(process.env.REVALUE_MAX_ITEMS_PER_JOB || 5000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function toNumber(x) {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "string") {
    let s = x.trim();
    if (!s) return null;
    s = s.replace(/,/g, "");
    s = s.replace(/[^\d.\-]/g, "");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toCentsFromPrice(x) {
  const n = toNumber(x);
  if (n == null || n <= 0) return null;
  return Math.round(n * 100);
}

function normalizeVariantType(input) {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return "normal";

  if (s === "normal") return "normal";
  if (s === "holo" || s === "holofoil") return "holofoil";
  if (
    s === "reverse" ||
    s === "reverse_holo" ||
    s === "reverseholo" ||
    s === "reverse_holofoil"
  )
    return "reverse_holofoil";
  if (s === "first" || s === "firstedition" || s === "first_edition")
    return "first_edition";
  if (s === "promo" || s === "wpromo" || s === "w_promo") return "promo";

  return "normal";
}

function pickTcgplayerWideCents(row, variantType) {
  let wideVal = null;

  if (variantType === "normal") wideVal = row.normal;
  else if (variantType === "holofoil") wideVal = row.holofoil;
  else if (variantType === "reverse_holofoil") wideVal = row.reverse_holofoil;
  else if (variantType === "first_edition") {
    wideVal = row.first_edition_holofoil ?? row.first_edition_normal ?? null;
  } else if (variantType === "promo") {
    wideVal = row.holofoil ?? row.normal ?? null;
  }

  const wideCents = toCentsFromPrice(wideVal);
  if (wideCents != null) return { cents: wideCents, used: "wide" };

  const generic =
    toCentsFromPrice(row.market_price) ??
    toCentsFromPrice(row.mid_price) ??
    toCentsFromPrice(row.low_price) ??
    toCentsFromPrice(row.high_price);

  if (generic != null) return { cents: generic, used: "generic" };

  return { cents: null, used: "none" };
}

function isUuidLike(s) {
  if (!s) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s).trim(),
  );
}

/**
 * Ensures the DB has the index your app needs for:
 * "only one active job (queued/running) per user"
 *
 * NOTE: This is a partial UNIQUE INDEX (not a constraint),
 * so app-side enqueue should use:
 *   ON CONFLICT DO NOTHING
 */
async function ensureActiveJobIndex(client) {
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_user_revalue_jobs_active_user
    ON public.user_revalue_jobs (user_id)
    WHERE status IN ('queued', 'running');
  `);
}

async function claimNextJob(client) {
  const { rows } = await client.query(`
    WITH next_job AS (
      SELECT id
      FROM public.user_revalue_jobs
      WHERE status = 'queued'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE public.user_revalue_jobs j
    SET status = 'running',
        started_at = COALESCE(started_at, now()),
        error = NULL
    FROM next_job
    WHERE j.id = next_job.id
    RETURNING j.id, j.user_id, j.status, j.created_at;
  `);

  return rows[0] || null;
}

async function markJobDone(client, jobId) {
  await client.query(
    `UPDATE public.user_revalue_jobs
     SET status='done', finished_at=now(), error=NULL
     WHERE id=$1`,
    [jobId],
  );
}

async function markJobFailed(client, jobId, err) {
  await client.query(
    `UPDATE public.user_revalue_jobs
     SET status='failed', finished_at=now(), error=$2
     WHERE id=$1`,
    [jobId, String(err?.stack || err?.message || err)],
  );
}

/** Pokémon raw price from tcg_card_prices_tcgplayer */
async function lookupPokemonRawDbUnitCents(client, cardId, variantType) {
  const { rows } = await client.query(
    `
    SELECT
      updated_at,
      variant_type,
      normal,
      holofoil,
      reverse_holofoil,
      first_edition_holofoil,
      first_edition_normal,
      market_price,
      low_price,
      mid_price,
      high_price,
      currency
    FROM public.tcg_card_prices_tcgplayer
    WHERE card_id = $1
    ORDER BY
      CASE WHEN variant_type = $2 THEN 0 ELSE 1 END,
      updated_at DESC NULLS LAST
    LIMIT 10
    `,
    [cardId, variantType],
  );

  if (!rows?.length) return null;

  for (const row of rows) {
    const picked = pickTcgplayerWideCents(row, variantType);
    if (picked.cents != null) {
      return {
        unitPriceCents: picked.cents,
        currency: (row.currency ?? "USD").toUpperCase(),
        source: "tcgplayer_db",
        confidence: picked.used === "wide" ? "variant_column" : "market_or_mid",
        updatedAt: row.updated_at ?? null,
      };
    }
  }

  return null;
}

/** YGO price from ygo_card_prices: pick best available source */
async function lookupYgoUnitCents(client, cardId) {
  const { rows } = await client.query(
    `
    SELECT
      tcgplayer_price,
      ebay_price,
      cardmarket_price,
      amazon_price,
      coolstuffinc_price
    FROM public.ygo_card_prices
    WHERE card_id = $1
    LIMIT 1
    `,
    [cardId],
  );

  if (!rows?.length) return null;
  const r = rows[0];

  const candidates = [
    { key: "tcgplayer_price", v: r.tcgplayer_price },
    { key: "cardmarket_price", v: r.cardmarket_price },
    { key: "ebay_price", v: r.ebay_price },
    { key: "amazon_price", v: r.amazon_price },
    { key: "coolstuffinc_price", v: r.coolstuffinc_price },
  ];

  for (const c of candidates) {
    const cents = toCentsFromPrice(c.v);
    if (cents != null) {
      return {
        unitPriceCents: cents,
        currency: "USD",
        source: `ygo_card_prices:${c.key}`,
        confidence: "db",
      };
    }
  }

  return null;
}

/** MTG price from mtg_prices_scryfall_latest using scryfall_id uuid */
async function lookupMtgUnitCents(client, scryfallIdUuid, finish) {
  const col =
    finish === "foil" ? "usd_foil" : finish === "etched" ? "usd_etched" : "usd";

  const { rows } = await client.query(
    `
    SELECT ${col} AS price, captured_at
    FROM public.mtg_prices_scryfall_latest
    WHERE scryfall_id = $1::uuid
    LIMIT 1
    `,
    [scryfallIdUuid],
  );

  if (!rows?.length) return null;

  const cents = toCentsFromPrice(rows[0].price);
  if (cents == null) return null;

  return {
    unitPriceCents: cents,
    currency: "USD",
    source: `mtg_prices_scryfall_latest:${col}`,
    confidence: "db",
  };
}

async function computeItemValueCents(client, item) {
  const qty = Number(item.quantity || 1) > 0 ? Number(item.quantity) : 1;

  const game = String(item.game || "").toLowerCase();
  const variantType = normalizeVariantType(item.variant_type);

  const grader = (item.grading_company || "").trim().toUpperCase();
  const grade = (item.grade_label || "").trim().toUpperCase();
  const isPsa = grader === "PSA" && grade !== "";

  // POKEMON
  if (game === "pokemon") {
    const raw = await lookupPokemonRawDbUnitCents(client, item.card_id, variantType);
    if (raw?.unitPriceCents != null) {
      return {
        totalCents: raw.unitPriceCents * qty,
        unitCents: raw.unitPriceCents,
        currency: raw.currency ?? "USD",
        source: raw.source,
        confidence: raw.confidence,
        metaExtra: {
          pricing_mode: isPsa ? "graded_raw_fallback" : "raw",
          grader: isPsa ? "PSA" : null,
          grade: isPsa ? grade : null,
          variant_type: variantType,
        },
      };
    }

    const fallback = Number(item.last_value_cents ?? 0);
    return {
      totalCents: fallback,
      unitCents: null,
      currency: "USD",
      source: "fallback_last_value",
      confidence: "low",
      metaExtra: {
        pricing_mode: isPsa ? "graded_fallback" : "raw_fallback",
        grader: isPsa ? "PSA" : null,
        grade: isPsa ? grade : null,
        variant_type: variantType,
      },
    };
  }

  // YGO
  if (game === "yugioh" || game === "ygo") {
    const ygo = await lookupYgoUnitCents(client, item.card_id);
    if (ygo?.unitPriceCents != null) {
      return {
        totalCents: ygo.unitPriceCents * qty,
        unitCents: ygo.unitPriceCents,
        currency: ygo.currency ?? "USD",
        source: ygo.source,
        confidence: ygo.confidence,
        metaExtra: {
          pricing_mode: "raw",
          variant_type: variantType,
        },
      };
    }

    const fallback = Number(item.last_value_cents ?? 0);
    return {
      totalCents: fallback,
      unitCents: null,
      currency: "USD",
      source: "fallback_last_value",
      confidence: "low",
      metaExtra: { pricing_mode: "raw_fallback", variant_type: variantType },
    };
  }

  // MTG
  if (game === "mtg" || game === "magic") {
    const id = String(item.card_id || "").trim();

    const finish =
      variantType === "holofoil"
        ? "foil"
        : variantType === "promo"
          ? "foil"
          : "normal";

    if (isUuidLike(id)) {
      const mtg = await lookupMtgUnitCents(client, id, finish);
      if (mtg?.unitPriceCents != null) {
        return {
          totalCents: mtg.unitPriceCents * qty,
          unitCents: mtg.unitPriceCents,
          currency: mtg.currency ?? "USD",
          source: mtg.source,
          confidence: mtg.confidence,
          metaExtra: {
            pricing_mode: "raw",
            finish,
            variant_type: variantType,
          },
        };
      }
    }

    const fallback = Number(item.last_value_cents ?? 0);
    return {
      totalCents: fallback,
      unitCents: null,
      currency: "USD",
      source: isUuidLike(id)
        ? "mtg_no_price_found_fallback"
        : "mtg_card_id_not_uuid_fallback",
      confidence: "low",
      metaExtra: {
        pricing_mode: "raw_fallback",
        finish,
        variant_type: variantType,
      },
    };
  }

  // Default fallback
  const fallback = Number(item.last_value_cents ?? 0);
  return {
    totalCents: fallback,
    unitCents: null,
    currency: "USD",
    source: "fallback_last_value",
    confidence: "low",
    metaExtra: { pricing_mode: "raw_fallback", variant_type: variantType },
  };
}

async function upsertDailyRollup(client, userId) {
  const { rows } = await client.query(
    `
    SELECT
      COALESCE(SUM(COALESCE(last_value_cents, 0)), 0)::bigint AS total_value_cents,
      COALESCE(SUM(COALESCE(quantity, 0)), 0)::bigint AS total_quantity,
      COALESCE(COUNT(*), 0)::bigint AS distinct_items,
      COALESCE(SUM(COALESCE(cost_cents, 0) * COALESCE(quantity, 0)), 0)::bigint AS total_cost_cents
    FROM public.user_collection_items
    WHERE user_id = $1
    `,
    [userId],
  );

  const totalValue = Number(rows?.[0]?.total_value_cents ?? 0);
  const totalQty = Number(rows?.[0]?.total_quantity ?? 0);
  const distinctItems = Number(rows?.[0]?.distinct_items ?? 0);
  const totalCost = Number(rows?.[0]?.total_cost_cents ?? 0);

  const unrealizedPnl = totalValue - totalCost;

  const { rows: gameRows } = await client.query(
    `
    SELECT
      COALESCE(game, 'unknown') AS game,
      COALESCE(SUM(COALESCE(last_value_cents, 0)), 0)::bigint AS value_cents,
      COALESCE(SUM(COALESCE(quantity, 0)), 0)::bigint AS quantity,
      COALESCE(COUNT(*), 0)::bigint AS items
    FROM public.user_collection_items
    WHERE user_id = $1
    GROUP BY COALESCE(game, 'unknown')
    ORDER BY value_cents DESC
    `,
    [userId],
  );

  const { rows: gradeRows } = await client.query(
    `
    SELECT
      CASE
        WHEN upper(btrim(COALESCE(grading_company, ''))) = 'PSA' AND btrim(COALESCE(grade_label,'')) <> '' THEN 'PSA'
        WHEN btrim(COALESCE(grading_company,'')) <> '' OR btrim(COALESCE(grade_label,'')) <> '' THEN 'GRADED_OTHER'
        ELSE 'RAW'
      END AS grading_bucket,
      COALESCE(COUNT(*), 0)::bigint AS items,
      COALESCE(SUM(COALESCE(quantity, 0)), 0)::bigint AS quantity,
      COALESCE(SUM(COALESCE(last_value_cents, 0)), 0)::bigint AS value_cents
    FROM public.user_collection_items
    WHERE user_id = $1
    GROUP BY 1
    ORDER BY value_cents DESC
    `,
    [userId],
  );

  const breakdown = {
    by_game: gameRows.map((r) => ({
      game: r.game,
      value_cents: Number(r.value_cents),
      quantity: Number(r.quantity),
      items: Number(r.items),
    })),
    by_grading: gradeRows.map((r) => ({
      bucket: r.grading_bucket,
      value_cents: Number(r.value_cents),
      quantity: Number(r.quantity),
      items: Number(r.items),
    })),
    totals: {
      total_value_cents: totalValue,
      total_cost_cents: totalCost,
      unrealized_pnl_cents: unrealizedPnl,
      total_quantity: totalQty,
      distinct_items: distinctItems,
    },
  };

  await client.query(
    `
    INSERT INTO public.user_collection_daily_valuations (
      user_id,
      as_of_date,
      total_value_cents,
      total_quantity,
      distinct_items,
      total_cost_cents,
      unrealized_pnl_cents,
      breakdown
    )
    VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7::jsonb)
    ON CONFLICT (user_id, as_of_date)
    DO UPDATE SET
      total_value_cents    = EXCLUDED.total_value_cents,
      total_quantity       = EXCLUDED.total_quantity,
      distinct_items       = EXCLUDED.distinct_items,
      total_cost_cents     = EXCLUDED.total_cost_cents,
      unrealized_pnl_cents = EXCLUDED.unrealized_pnl_cents,
      breakdown            = EXCLUDED.breakdown,
      updated_at           = now()
    `,
    [
      userId,
      totalValue,
      totalQty,
      distinctItems,
      totalCost,
      unrealizedPnl,
      JSON.stringify(breakdown),
    ],
  );

  return {
    total_value_cents: totalValue,
    total_quantity: totalQty,
    distinct_items: distinctItems,
    total_cost_cents: totalCost,
    unrealized_pnl_cents: unrealizedPnl,
  };
}

async function processUser(client, userId) {
  const { rows: items } = await client.query(
    `
    SELECT
      id, user_id, game, card_id, card_name, variant_type,
      grading_company, grade_label, cert_number,
      quantity,
      last_value_cents
    FROM public.user_collection_items
    WHERE user_id = $1
    ORDER BY game, card_id
    LIMIT $2
    `,
    [userId, MAX_ITEMS_PER_JOB],
  );

  if (!items.length) {
    await upsertDailyRollup(client, userId);
    return { items: 0, updated: 0 };
  }

  let updated = 0;

  for (const item of items) {
    const computed = await computeItemValueCents(client, item);

    const meta = {
      unit_price_cents: computed.unitCents ?? null,
      quantity: Number(item.quantity || 1),
      card_id: item.card_id,
      variant_type: normalizeVariantType(item.variant_type),
      grading_company: item.grading_company || null,
      grade_label: item.grade_label || null,
      cert_number: item.cert_number || null,
      currency: computed.currency ?? "USD",
      source_detail: computed.source,
      confidence_detail: computed.confidence,
      ...computed.metaExtra,
    };

    await client.query(
      `UPDATE public.user_collection_items
       SET last_value_cents = $2, updated_at = now()
       WHERE id = $1`,
      [item.id, computed.totalCents],
    );

    const source = "live";
    const confidence = computed.confidence || "medium";

    await client.query(
      `
      INSERT INTO public.user_collection_item_valuations
        (user_id, item_id, as_of_date, value_cents, currency, source, confidence, meta, game)
      VALUES
        ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7::jsonb, $8)
      ON CONFLICT (user_id, item_id, as_of_date, COALESCE(source, ''))
      DO UPDATE SET
        value_cents = EXCLUDED.value_cents,
        currency    = EXCLUDED.currency,
        confidence  = EXCLUDED.confidence,
        meta        = EXCLUDED.meta,
        game        = EXCLUDED.game,
        updated_at  = now();
      `,
      [
        item.user_id,
        item.id,
        computed.totalCents,
        computed.currency ?? "USD",
        source,
        confidence,
        JSON.stringify(meta),
        item.game,
      ],
    );

    updated += 1;
  }

  const total = await upsertDailyRollup(client, userId);

  return { items: items.length, updated, total_value_cents: total };
}

async function main() {
  console.log("=== Revalue Worker: start ===");

  let stopping = false;
  process.on("SIGINT", () => (stopping = true));
  process.on("SIGTERM", () => (stopping = true));

  // ✅ Ensure the required partial unique index exists (so app enqueue doesn’t error)
  {
    const client = await pool.connect();
    try {
      await ensureActiveJobIndex(client);
      console.log("DB ok: ensured ux_user_revalue_jobs_active_user index");
    } catch (e) {
      console.error("WARNING: failed to ensure active-job unique index:", e);
    } finally {
      client.release();
    }
  }

  while (!stopping) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const job = await claimNextJob(client);
      await client.query("COMMIT");
      client.release();

      if (!job) {
        await sleep(SLEEP_MS);
        continue;
      }

      console.log(`Claimed job ${job.id} for user ${job.user_id}`);

      const client2 = await pool.connect();
      try {
        const res = await processUser(client2, job.user_id);
        console.log(
          `Done user ${job.user_id}: ${res.updated}/${res.items} items updated` +
            (res.total_value_cents != null ? ` total=${JSON.stringify(res.total_value_cents)}` : ""),
        );
        await markJobDone(client2, job.id);
      } catch (err) {
        console.error("Job failed:", err);
        await markJobFailed(client2, job.id, err);
      } finally {
        client2.release();
      }
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      client.release();
      console.error("Worker loop error:", err);
      await sleep(1000);
    }
  }

  console.log("=== Revalue Worker: stopping ===");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
