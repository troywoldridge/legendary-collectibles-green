// src/app/api/collection/add/route.ts
import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getUserPlan } from "@/lib/plans";
import { getLivePriceForCard, normalizeGame, type GameId } from "@/lib/livePrices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  game?: string;
  cardId?: string;
  cardName?: string;
  setName?: string;
  imageUrl?: string;

  variantType?: string | null;

  grading_company?: string;
  grade_label?: string;
  cert_number?: string | null;
  purchase_date?: string | null;

  quantity?: number;
  folder?: string | null;
  cost_cents?: number | null;
};

function isPgErrorWithCode(err: unknown, code: string) {
  return typeof err === "object" && err !== null && "code" in err && (err as any).code === code;
}

// YYYY-MM-DD for DATE columns (as string)
function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Canonical DB values for user_collection_items.variant_type:
 * - normal
 * - holofoil
 * - reverse_holofoil
 * - first_edition
 * - promo
 */
type CanonVariant = "normal" | "holofoil" | "reverse_holofoil" | "first_edition" | "promo";

function normalizeVariantType(input: unknown): CanonVariant {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return "normal";

  if (s === "normal") return "normal";
  if (s === "holo" || s === "holofoil") return "holofoil";
  if (s === "reverse" || s === "reverse_holo" || s === "reverseholo" || s === "reverse_holofoil")
    return "reverse_holofoil";
  if (s === "first" || s === "firstedition" || s === "first_edition") return "first_edition";
  if (s === "promo" || s === "wpromo" || s === "w_promo") return "promo";

  return "normal";
}

function variantLabel(v: string): string {
  switch (v) {
    case "holofoil":
      return "Holo";
    case "reverse_holofoil":
      return "Reverse";
    case "first_edition":
      return "1st Ed";
    case "promo":
      return "Promo";
    default:
      return "Normal";
  }
}

/** tolerant parsing: handles "0.07", "$0.07", " 0.07 " */
function toNumber(x: unknown): number | null {
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

function toCentsFromPrice(x: unknown): number | null {
  const n = toNumber(x);
  if (n == null || n <= 0) return null;
  return Math.round(n * 100);
}

function pickTcgplayerWideCents(
  row: {
    normal: string | null;
    holofoil: string | null;
    reverse_holofoil: string | null;
    first_edition_holofoil: string | null;
    first_edition_normal: string | null;
    market_price: string | number | null;
    low_price: string | number | null;
    mid_price: string | number | null;
    high_price: string | number | null;
  },
  variantType: CanonVariant,
): { cents: number | null; used: "wide" | "generic" | "none" } {
  let wideVal: string | null = null;

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

/**
 * Pokémon DB-first lookup:
 * - Reads wide columns (normal/holofoil/reverse_holofoil/etc.) on tcgplayer table
 * - Works even when variant_type is blank (your me1 rows are like this)
 * - If no usable price in DB, returns null (caller may optionally fallback to live)
 */
async function lookupPokemonDbPrice(cardId: string, variantType: CanonVariant) {
  const res = await db.execute<{
    updated_at: string | null;
    variant_type: string | null;

    normal: string | null;
    holofoil: string | null;
    reverse_holofoil: string | null;
    first_edition_holofoil: string | null;
    first_edition_normal: string | null;

    market_price: string | number | null;
    low_price: string | number | null;
    mid_price: string | number | null;
    high_price: string | number | null;

    currency: string | null;
  }>(sql`
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
    WHERE card_id = ${cardId}
    ORDER BY
      CASE WHEN variant_type = ${variantType} THEN 0 ELSE 1 END,
      CASE
        WHEN ${variantType} = 'normal' AND normal IS NOT NULL AND btrim(normal) <> '' THEN 0
        WHEN ${variantType} = 'holofoil' AND holofoil IS NOT NULL AND btrim(holofoil) <> '' THEN 0
        WHEN ${variantType} = 'reverse_holofoil' AND reverse_holofoil IS NOT NULL AND btrim(reverse_holofoil) <> '' THEN 0
        ELSE 1
      END,
      updated_at DESC NULLS LAST
    LIMIT 10
  `);

  const rows = res.rows ?? [];
  if (!rows.length) return null;

  for (const row of rows) {
    const picked = pickTcgplayerWideCents(row, variantType);
    if (picked.cents != null) {
      return {
        unitPriceCents: picked.cents,
        source: "tcgplayer_db",
        confidence: picked.used === "wide" ? "variant_column" : "market_or_mid",
        currency: (row.currency ?? "USD").toUpperCase(),
        updatedAt: row.updated_at ?? null,
      };
    }
  }

  return null;
}

/**
 * Enqueue a per-user revalue job (deduped by your partial unique index).
 * This is what makes dashboards update shortly after adding cards.
 */
async function enqueueRevalueJob(userId: string) {
  try {
    await db.execute(sql`
      INSERT INTO public.user_revalue_jobs (user_id, status)
      VALUES (${userId}, 'queued')
      ON CONFLICT ON CONSTRAINT ux_user_revalue_jobs_active_user
      DO NOTHING
    `);
  } catch (err) {
    // Never block add() if queue insert fails
    console.warn("enqueueRevalueJob failed (continuing)", err);
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ---- Core fields ----
  const gameRaw = (body.game ?? "").trim().toLowerCase();
  const cardId = (body.cardId ?? "").trim();

  const cardName = body.cardName?.trim() ?? null;
  const setName = body.setName?.trim() ?? null;
  const imageUrl = body.imageUrl?.trim() ?? null;

  // IMPORTANT: match DB defaults (''), not "UNGR"/"Ungraded"
  const gradingCompany = (body.grading_company ?? "").trim().toUpperCase();
  const gradeLabel = (body.grade_label ?? "").trim();

  const certNumber = (body.cert_number ?? "").toString().trim();
  const purchaseDate = body.purchase_date ?? null;

  const variantType: CanonVariant = normalizeVariantType(body.variantType);

  const qtyRaw = body.quantity ?? 1;
  const quantity =
    Number.isFinite(qtyRaw) && (qtyRaw as number) > 0 ? Math.floor(qtyRaw as number) : 1;

  const folder = (body.folder ?? "Unsorted")?.trim() || "Unsorted";
  const normalizedFolderKey = folder || "__default__";

  const costCents =
    typeof body.cost_cents === "number" && Number.isFinite(body.cost_cents)
      ? Math.floor(body.cost_cents)
      : null;

  if (!gameRaw || !cardId) {
    return NextResponse.json({ error: "Missing required fields game/cardId" }, { status: 400 });
  }

  const gameNorm = normalizeGame(gameRaw) ?? gameRaw;

  // ---- Plan-based limits ----
  const plan = await getUserPlan(userId);
  const isPro = plan.id === "pro";
  const isCollector = plan.id === "collector";
  const isFree = !isPro && !isCollector;

  // Determine whether this add will INSERT a new row or UPDATE an existing one.
  let existingId: string | null = null;

  try {
    const existingRes = await db.execute<{ id: string }>(sql`
      SELECT id
      FROM public.user_collection_items
      WHERE user_id = ${userId}
        AND game = ${gameNorm}
        AND card_id = ${cardId}
        AND variant_type = ${variantType}
        AND COALESCE(grading_company,'') = COALESCE(${gradingCompany},'')
        AND COALESCE(grade_label,'') = COALESCE(${gradeLabel},'')
        AND COALESCE(cert_number,'') = COALESCE(${certNumber},'')
        AND COALESCE(folder,'__default__') = ${normalizedFolderKey}
      LIMIT 1
    `);

    existingId = existingRes.rows?.[0]?.id ?? null;
  } catch (err) {
    console.error("collection/add failed during existing lookup", err);
    return NextResponse.json({ error: "Database error looking up existing item" }, { status: 500 });
  }

  if (!isPro) {
    try {
      const usageRes = await db.execute<{
        total_items: number | string | null;
        collections: number | string | null;
      }>(sql`
        SELECT
          COUNT(*)::int AS total_items,
          COUNT(DISTINCT COALESCE(folder,'__default__'))::int AS collections
        FROM public.user_collection_items
        WHERE user_id = ${userId}
      `);

      const usage = usageRes.rows?.[0] ?? { total_items: 0, collections: 0 };
      const currentItems = Number(usage.total_items ?? 0);
      const currentCollections = Number(usage.collections ?? 0);

      const hasFolderRes = await db.execute<{ exists: number }>(sql`
        SELECT 1 AS exists
        FROM public.user_collection_items
        WHERE user_id = ${userId}
          AND COALESCE(folder, '__default__') = ${normalizedFolderKey}
        LIMIT 1
      `);
      const isNewCollection = (hasFolderRes.rows?.length ?? 0) === 0;

      const projectedItems = currentItems + (existingId ? 0 : 1);
      const projectedCollections = currentCollections + (isNewCollection ? 1 : 0);

      let maxCollections: number | null = null;
      let maxItems: number | null = null;

      if (isFree) {
        maxCollections = 1;
        maxItems = 500;
      } else if (isCollector) {
        maxCollections = 5;
        maxItems = 5000;
      }

      if (
        (maxItems != null && projectedItems > maxItems) ||
        (maxCollections != null && projectedCollections > maxCollections)
      ) {
        const planName = isFree ? "Free" : isCollector ? "Collector" : plan.id;

        const errorParts: string[] = [];
        if (maxItems != null && projectedItems > maxItems)
          errorParts.push(`item limit reached (${currentItems}/${maxItems})`);
        if (maxCollections != null && projectedCollections > maxCollections)
          errorParts.push(`collection limit reached (${currentCollections}/${maxCollections})`);

        return NextResponse.json(
          {
            error: "Plan limit reached",
            message: `Your ${planName} plan has reached its limit: ${errorParts.join(" and ")}.`,
            plan: planName,
            current: { items: currentItems, collections: currentCollections },
            projected: { items: projectedItems, collections: projectedCollections },
            limits: { maxItems, maxCollections },
            upgradeUrl: "/pricing",
          },
          { status: 403 },
        );
      }
    } catch (err) {
      console.error("collection/add failed during plan usage check", err);
      return NextResponse.json({ error: "Database error checking plan limits" }, { status: 500 });
    }
  }

  // ---- Price lookup (best-effort, never blocks add) ----
  let unitPriceCents: number | null = null;
  let priceSource: string | null = null;
  let priceConfidence: string | null = null;
  let priceCurrency: string | null = null;

  try {
    if (gameNorm === "pokemon") {
      // 1️⃣ DB-first lookup (authoritative)
      const dbPrice = await lookupPokemonDbPrice(cardId, variantType);

      if (dbPrice) {
        unitPriceCents = dbPrice.unitPriceCents;
        priceSource = dbPrice.source;
        priceConfidence = dbPrice.confidence;
        priceCurrency = dbPrice.currency ?? "USD";
      } else {
        // 2️⃣ Live fallback ONLY if DB has nothing usable
        const livePrice = await getLivePriceForCard("pokemon", cardId, variantType);

        if (livePrice) {
          unitPriceCents = Math.round(livePrice.amount * 100);
          priceSource = livePrice.source;
          priceConfidence = "live_fallback";
          priceCurrency = livePrice.currency ?? "USD";
        }
      }
    } else {
      // Non-Pokémon paths unchanged
      const livePrice = await getLivePriceForCard(gameNorm as GameId, cardId);

      if (livePrice) {
        unitPriceCents = Math.round(livePrice.amount * 100);
        priceSource = livePrice.source;
        priceConfidence = "live";
        priceCurrency = livePrice.currency ?? "USD";
      }
    }
  } catch (err) {
    console.warn("collection/add price lookup failed (continuing)", err);
  }

  const asOfDate = todayISODate();

  // ---- Write (UPDATE existing or INSERT new) ----
  try {
    if (existingId) {
      const updatedRes = await db.execute<{ quantity: number }>(sql`
        UPDATE public.user_collection_items
        SET
          quantity = quantity + ${quantity},
          cost_cents = COALESCE(${costCents}, cost_cents),
          updated_at = NOW()
        WHERE id = ${existingId}
        RETURNING quantity
      `);

      const newQty = Number(updatedRes.rows?.[0]?.quantity ?? 1);

      let newLastValueCents: number | null = null;

      if (unitPriceCents != null) {
        newLastValueCents = unitPriceCents * newQty;

        await db.execute(sql`
          UPDATE public.user_collection_items
          SET
            last_value_cents = ${newLastValueCents},
            updated_at = NOW()
          WHERE id = ${existingId}
        `);

        const metaJson = JSON.stringify({
          unit_price_cents: unitPriceCents,
          quantity: newQty,
          card_id: cardId,
          variant_type: variantType,
          grading_company: gradingCompany || null,
          grade_label: gradeLabel || null,
          cert_number: certNumber || null,
          currency: priceCurrency ?? "USD",
        });

        try {
          await db.execute(sql`
            INSERT INTO public.user_collection_item_valuations (
              user_id,
              item_id,
              as_of_date,
              game,
              value_cents,
              currency,
              source,
              confidence,
              meta
            )
            VALUES (
              ${userId},
              ${existingId},
              ${asOfDate},
              ${gameNorm},
              ${newLastValueCents},
              ${priceCurrency ?? "USD"},
              ${priceSource},
              ${priceConfidence},
              ${metaJson}::jsonb
            )
            ON CONFLICT (user_id, item_id, as_of_date, COALESCE(source, ''::text))
            DO UPDATE SET
              value_cents = EXCLUDED.value_cents,
              currency    = EXCLUDED.currency,
              game        = EXCLUDED.game,
              confidence  = COALESCE(EXCLUDED.confidence, user_collection_item_valuations.confidence),
              meta        = COALESCE(EXCLUDED.meta, user_collection_item_valuations.meta),
              updated_at  = NOW()
          `);
        } catch (err) {
          console.warn("valuation snapshot failed (continuing)", err);
        }
      }

      // ✅ enqueue per-user revalue (debounced by partial unique index)
      await enqueueRevalueJob(userId);

      return NextResponse.json({
        ok: true,
        updated: true,
        itemId: existingId,
        quantity: newQty,
        variant_type: variantType,
        variant_label: variantLabel(variantType),
        unit_price_cents: unitPriceCents,
        last_value_cents: newLastValueCents,
        priced: unitPriceCents != null,
        source: priceSource,
      });
    }

    const insertedLastValueCents = unitPriceCents != null ? unitPriceCents * quantity : 0;

    const insertRes = await db.execute<{ id: string }>(sql`
      INSERT INTO public.user_collection_items (
        user_id,
        game,
        card_id,
        card_name,
        set_name,
        image_url,
        variant_type,
        grading_company,
        grade_label,
        cert_number,
        purchase_date,
        quantity,
        folder,
        cost_cents,
        last_value_cents,
        updated_at
      )
      VALUES (
        ${userId},
        ${gameNorm},
        ${cardId},
        ${cardName},
        ${setName},
        ${imageUrl},
        ${variantType},
        ${gradingCompany},
        ${gradeLabel},
        ${certNumber},
        ${purchaseDate},
        ${quantity},
        ${folder},
        ${costCents},
        ${insertedLastValueCents},
        NOW()
      )
      RETURNING id
    `);

    const newItemId = insertRes.rows?.[0]?.id ?? null;

    if (newItemId && unitPriceCents != null) {
      const metaJson = JSON.stringify({
        unit_price_cents: unitPriceCents,
        quantity,
        card_id: cardId,
        variant_type: variantType,
        grading_company: gradingCompany || null,
        grade_label: gradeLabel || null,
        cert_number: certNumber || null,
        currency: priceCurrency ?? "USD",
      });

      try {
        await db.execute(sql`
          INSERT INTO public.user_collection_item_valuations (
            user_id,
            item_id,
            as_of_date,
            game,
            value_cents,
            currency,
            source,
            confidence,
            meta
          )
          VALUES (
            ${userId},
            ${newItemId},
            ${asOfDate},
            ${gameNorm},
            ${insertedLastValueCents},
            ${priceCurrency ?? "USD"},
            ${priceSource},
            ${priceConfidence},
            ${metaJson}::jsonb
          )
          ON CONFLICT (user_id, item_id, as_of_date, COALESCE(source, ''::text))
          DO UPDATE SET
            value_cents = EXCLUDED.value_cents,
            currency    = EXCLUDED.currency,
            game        = EXCLUDED.game,
            confidence  = COALESCE(EXCLUDED.confidence, user_collection_item_valuations.confidence),
            meta        = COALESCE(EXCLUDED.meta, user_collection_item_valuations.meta),
            updated_at  = NOW()
        `);
      } catch (err) {
        console.warn("valuation snapshot failed (continuing)", err);
      }
    }

    // ✅ enqueue per-user revalue (debounced by partial unique index)
    await enqueueRevalueJob(userId);

    return NextResponse.json({
      ok: true,
      inserted: true,
      itemId: newItemId,
      quantity,
      variant_type: variantType,
      variant_label: variantLabel(variantType),
      unit_price_cents: unitPriceCents,
      last_value_cents: insertedLastValueCents,
      priced: unitPriceCents != null,
      source: priceSource,
    });
  } catch (err) {
    console.error("collection/add failed during write", err);

    if (isPgErrorWithCode(err, "23505")) {
      return NextResponse.json({ error: "Duplicate collection item" }, { status: 409 });
    }

    return NextResponse.json({ error: "Database error inserting collection item" }, { status: 500 });
  }
}
