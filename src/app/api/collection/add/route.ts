// src/app/api/collection/add/route.ts
import "server-only";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getUserPlan } from "@/lib/plans";
import {
  getLivePriceForCard,
  normalizeGame,
  type GameId,
} from "@/lib/livePrices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  game?: string;
  cardId?: string;
  cardName?: string;
  setName?: string;
  imageUrl?: string;

  grading_company?: string;
  grade_label?: string;
  cert_number?: string | null;
  purchase_date?: string | null;

  quantity?: number;
  folder?: string | null;
  cost_cents?: number | null;
};

function isPgErrorWithCode(err: unknown, code: string) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as any).code === code
  );
}

// YYYY-MM-DD for DATE columns (as string)
function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
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

  const gradingCompany = (body.grading_company ?? "UNGR").trim().toUpperCase();
  const gradeLabel = (body.grade_label ?? "Ungraded").trim();
  const certNumber = body.cert_number?.trim() || null;
  const purchaseDate = body.purchase_date ?? null;

  const qtyRaw = body.quantity ?? 1;
  const quantity =
    Number.isFinite(qtyRaw) && (qtyRaw as number) > 0
      ? Math.floor(qtyRaw as number)
      : 1;

  const folder = (body.folder ?? "Unsorted")?.trim() || "Unsorted";
  const normalizedFolderKey = folder || "__default__";

  const costCents =
    typeof body.cost_cents === "number" && Number.isFinite(body.cost_cents)
      ? Math.floor(body.cost_cents)
      : null;

  if (!gameRaw || !cardId) {
    return NextResponse.json(
      { error: "Missing required fields game/cardId" },
      { status: 400 },
    );
  }

  // Normalize game id for pricing + storage consistency
  const gameNorm = normalizeGame(gameRaw) ?? gameRaw;

  // ---- Plan-based limits (Free/Collector) ----
  const plan = await getUserPlan(userId);
  const isPro = plan.id === "pro";
  const isCollector = plan.id === "collector";
  const isFree = !isPro && !isCollector;

  // Determine whether this add will INSERT a new row or just UPDATE an existing one.
  let existingId: string | null = null;

  try {
    const existingRes = await db.execute<{ id: string }>(sql`
      SELECT id
      FROM user_collection_items
      WHERE user_id = ${userId}
        AND game = ${gameNorm}
        AND card_id = ${cardId}
        AND grading_company = ${gradingCompany}
        AND grade_label = ${gradeLabel}
        AND COALESCE(cert_number,'') = COALESCE(${certNumber},'')
      LIMIT 1
    `);

    existingId = existingRes.rows?.[0]?.id ?? null;
  } catch (err) {
    console.error("collection/add failed during existing lookup", err);
    return NextResponse.json(
      { error: "Database error looking up existing item" },
      { status: 500 },
    );
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
        FROM user_collection_items
        WHERE user_id = ${userId}
      `);

      const usage = usageRes.rows?.[0] ?? { total_items: 0, collections: 0 };
      const currentItems = Number(usage.total_items ?? 0);
      const currentCollections = Number(usage.collections ?? 0);

      const hasFolderRes = await db.execute<{ exists: number }>(sql`
        SELECT 1 AS exists
        FROM user_collection_items
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
        const hitItems = maxItems != null && projectedItems > maxItems;
        const hitCollections = maxCollections != null && projectedCollections > maxCollections;

        const planName = isFree ? "Free" : isCollector ? "Collector" : plan.id;

        const errorParts: string[] = [];
        if (hitItems && maxItems != null) {
          errorParts.push(`item limit reached (${currentItems}/${maxItems})`);
        }
        if (hitCollections && maxCollections != null) {
          errorParts.push(
            `collection limit reached (${currentCollections}/${maxCollections})`,
          );
        }

        return NextResponse.json(
          {
            error: "Plan limit reached",
            message: `Your ${planName} plan has reached its limit: ${errorParts.join(
              " and ",
            )}.`,
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
      return NextResponse.json(
        { error: "Database error checking plan limits" },
        { status: 500 },
      );
    }
  }

  // ---- Price once (only for this add) ----
  // If pricing fails, we still insert/update the item.
  let unitPriceCents: number | null = null;
  let priceSource: string | null = null;
  let priceConfidence: string | null = null;

  try {
    const livePrice = await getLivePriceForCard(gameNorm as GameId, cardId);
    if (livePrice) {
      unitPriceCents = Math.round(livePrice.amount * 100);
      priceSource = (livePrice as any)?.source ?? null;
      priceConfidence = (livePrice as any)?.confidence ?? null;
    }
  } catch (err) {
    console.warn("collection/add price lookup failed (continuing)", err);
  }

  const asOfDate = todayISODate();

  // ---- Write (UPDATE existing or INSERT new) + update last_value_cents ----
  try {
    if (existingId) {
      // Update quantity first; get the new quantity back
      const updatedRes = await db.execute<{ quantity: number }>(sql`
        UPDATE user_collection_items
        SET
          quantity = quantity + ${quantity},
          folder = COALESCE(${folder}, folder),
          cost_cents = COALESCE(${costCents}, cost_cents),
          updated_at = NOW()
        WHERE id = ${existingId}
        RETURNING quantity
      `);

      const newQty = Number(updatedRes.rows?.[0]?.quantity ?? 1);

      // Only update value if we got a price
      let newLastValueCents: number | null = null;

      if (unitPriceCents != null) {
        newLastValueCents = unitPriceCents * newQty;

        await db.execute(sql`
          UPDATE user_collection_items
          SET
            last_value_cents = ${newLastValueCents},
            updated_at = NOW()
          WHERE id = ${existingId}
        `);

        // Snapshot valuation (upsert) - IMPORTANT: use existingId + newLastValueCents
        const metaJson = JSON.stringify({
          unit_price_cents: unitPriceCents,
          quantity: newQty,
          card_id: cardId,
        });

        try {
          await db.execute(sql`
            INSERT INTO user_collection_item_valuations (
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
              'USD',
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
          // don't block adding cards if the snapshot table hiccups
          console.warn("valuation snapshot failed (continuing)", err);
        }
      }

      return NextResponse.json({
        ok: true,
        updated: true,
        itemId: existingId,
        quantity: newQty,
        unit_price_cents: unitPriceCents,
        last_value_cents: newLastValueCents, // null if we couldn't price
        priced: unitPriceCents != null,
        source: priceSource,
      });
    }

    // INSERT path
    const insertedLastValueCents =
      unitPriceCents != null ? unitPriceCents * quantity : 0;

    const insertRes = await db.execute<{ id: string }>(sql`
      INSERT INTO user_collection_items (
        user_id,
        game,
        card_id,
        card_name,
        set_name,
        image_url,
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

    // Snapshot valuation if we got a price and we got an id
    if (newItemId && unitPriceCents != null) {
      const metaJson = JSON.stringify({
        unit_price_cents: unitPriceCents,
        quantity,
        card_id: cardId,
      });

      try {
        await db.execute(sql`
          INSERT INTO user_collection_item_valuations (
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
            'USD',
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

    return NextResponse.json({
      ok: true,
      inserted: true,
      itemId: newItemId,
      quantity,
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

    return NextResponse.json(
      { error: "Database error inserting collection item" },
      { status: 500 },
    );
  }
}
