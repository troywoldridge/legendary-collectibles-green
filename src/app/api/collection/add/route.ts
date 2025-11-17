// src/app/api/collection/add/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { getUserPlan } from "@/lib/plans";

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plan = await getUserPlan(userId);
  const isPro = plan.id === "pro";
  const isCollector = plan.id === "collector";
  const isFree = !isPro && !isCollector;

  // ---- Core fields ----
  const game = (body.game ?? "").trim().toLowerCase();
  const cardId = (body.cardId ?? "").trim();

  const cardName = body.cardName?.trim() ?? null;
  const setName = body.setName?.trim() ?? null;
  const imageUrl = body.imageUrl?.trim() ?? null;

  const gradingCompany = (body.grading_company ?? "UNGR").toUpperCase();
  const gradeLabel = body.grade_label ?? "Ungraded";
  const certNumber = body.cert_number?.trim() || null;
  const purchaseDate = body.purchase_date ?? null;

  const qtyRaw = body.quantity ?? 1;
  const quantity =
    Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1;

  const folder = body.folder ?? null;
  const normalizedFolderKey = folder ?? "__default__";

  const costCents =
    typeof body.cost_cents === "number" && Number.isFinite(body.cost_cents)
      ? Math.floor(body.cost_cents)
      : null;

  if (!game || !cardId) {
    return NextResponse.json(
      { error: "Missing required fields game/cardId" },
      { status: 400 },
    );
  }

  // ---- Plan-based limits (items + collections) ----
  // Free: 1 collection, 500 items
  // Collector: 5 collections, 5000 items
  // Pro: unlimited
  if (!isPro) {
    // current totals
    const usageRes = await db.execute<{
      total_items: string | null;
      collections: number | null;
    }>(sql`
      SELECT
        COALESCE(SUM(quantity), 0)::bigint::text AS total_items,
        COUNT(DISTINCT COALESCE(folder, '__default__'))::integer AS collections
      FROM user_collection_items
      WHERE user_id = ${userId}
    `);

    const usage = usageRes.rows?.[0] ?? {
      total_items: "0",
      collections: 0,
    };

    const currentItems = Number(usage.total_items ?? "0");
    const currentCollections = Number(usage.collections ?? 0);

    // Will this create a new collection (folder)?
    const hasFolderRes = await db.execute<{ exists: number }>(sql`
      SELECT 1 AS exists
      FROM user_collection_items
      WHERE user_id = ${userId}
        AND COALESCE(folder, '__default__') = ${normalizedFolderKey}
      LIMIT 1
    `);
    const isNewCollection = hasFolderRes.rows.length === 0;

    const projectedItems = currentItems + quantity;
    const projectedCollections =
      currentCollections + (isNewCollection ? 1 : 0);

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
      // Figure out which limit hit first for a clearer error
      const hitItems =
        maxItems != null && projectedItems > maxItems;
      const hitCollections =
        maxCollections != null &&
        projectedCollections > maxCollections;

      const planName = isFree
        ? "Free"
        : isCollector
        ? "Collector"
        : plan.id;

      const errorParts: string[] = [];
      if (hitItems && maxItems != null) {
        errorParts.push(
          `item limit reached (${currentItems}/${maxItems} items)`,
        );
      }
      if (hitCollections && maxCollections != null) {
        errorParts.push(
          `collection limit reached (${currentCollections}/${maxCollections} collections)`,
        );
      }

      return NextResponse.json(
        {
          error: "Plan limit reached",
          message: `Your ${planName} plan has reached its limit: ${errorParts.join(
            " and ",
          )}.`,
          plan: planName,
          current: {
            items: currentItems,
            collections: currentCollections,
          },
          projected: {
            items: projectedItems,
            collections: projectedCollections,
          },
          limits: {
            maxItems,
            maxCollections,
          },
          upgradeUrl: "/pricing",
        },
        { status: 403 },
      );
    }
  }

  // ---- Insert / upsert ----
  try {
    await db.execute(
      sql`
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
          cost_cents
        )
        VALUES (
          ${userId},
          ${game},
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
          ${costCents}
        )
        ON CONFLICT (
          user_id,
          game,
          card_id,
          grading_company,
          grade_label,
          COALESCE(cert_number,'')
        )
        DO UPDATE SET
          quantity   = user_collection_items.quantity + EXCLUDED.quantity,
          folder     = COALESCE(EXCLUDED.folder, user_collection_items.folder),
          cost_cents = COALESCE(EXCLUDED.cost_cents, user_collection_items.cost_cents),
          updated_at = NOW()
      `,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("collection/add failed", err);
    return NextResponse.json(
      { error: "Database error inserting collection item" },
      { status: 500 },
    );
  }
}
