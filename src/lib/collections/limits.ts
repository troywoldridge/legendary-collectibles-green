// src/lib/collections/limits.ts
import "server-only";

import { sql, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  getUserPlan,
  type Plan,
  planCapabilities,
  canAddCollection,
  canAddItem,
} from "@/lib/plans";
import { collections, collectionItems } from "@/lib/db/schema/collections";

export type CollectionCounts = {
  collections: number;
  items: number;
};

/* ========== Typed Errors ========== */

export class PlanLimitError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    status = 403,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PlanLimitError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class CollectionLimitError extends PlanLimitError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "collection_limit", 403, details);
    this.name = "CollectionLimitError";
  }
}

export class ItemLimitError extends PlanLimitError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "item_limit", 403, details);
    this.name = "ItemLimitError";
  }
}

/* ========== Counts from DB ========== */
/**
 * Counts BOTH:
 *  - New Drizzle collections/items (collections + collectionItems)
 *  - Legacy user_collection_items (folder-based “collections”)
 *
 * So plan limits apply across the whole account, regardless of which API path is used.
 */
export async function getCollectionCounts(userId: string): Promise<CollectionCounts> {
  if (!userId) {
    return { collections: 0, items: 0 };
  }

  const [canonicalCollRes, canonicalItemsRes, legacyRes] = await Promise.all([
    // New collections table
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(collections)
      .where(eq(collections.userId, userId)),

    // New items table, joined via collections to ensure ownership
    db
      .select({
        total: sql<string>`coalesce(sum(${collectionItems.quantity}), 0)::bigint::text`,
      })
      .from(collectionItems)
      .innerJoin(
        collections,
        and(eq(collectionItems.collectionId, collections.id), eq(collections.userId, userId)),
      ),

    // Legacy user_collection_items (folder-based)
    db.execute<{
      total_items: string | null;
      collections: number | null;
    }>(sql`
      SELECT
        COALESCE(SUM(quantity), 0)::bigint::text AS total_items,
        COUNT(DISTINCT COALESCE(folder, '__default__'))::integer AS collections
      FROM user_collection_items
      WHERE user_id = ${userId}
    `),
  ]);

  const canonicalCollections = canonicalCollRes[0]?.n ?? 0;
  const canonicalItems = Number(canonicalItemsRes[0]?.total ?? "0");

  const legacyRow = legacyRes.rows?.[0] ?? {
    total_items: "0",
    collections: 0,
  };
  const legacyItems = Number(legacyRow.total_items ?? "0");
  const legacyCollections = Number(legacyRow.collections ?? 0);

  return {
    collections: canonicalCollections + legacyCollections,
    items: canonicalItems + legacyItems,
  };
}

/* ========== Helper messages ========== */

function buildCollectionLimitMessage(plan: Plan, counts: CollectionCounts): string {
  const caps = planCapabilities(plan);

  if (caps.maxCollections == null) {
    return "You have reached a collection limit for your plan.";
  }

  return `Your current plan (${plan.name}) allows up to ${caps.maxCollections} collection${
    caps.maxCollections === 1 ? "" : "s"
  }. You already have ${counts.collections}. Upgrade your plan to create more collections.`;
}

function buildItemLimitMessage(plan: Plan, counts: CollectionCounts): string {
  const caps = planCapabilities(plan);

  if (caps.maxItemsTotal == null) {
    return "You have reached an item limit for your plan.";
  }

  return `Your current plan (${plan.name}) allows up to ${caps.maxItemsTotal?.toLocaleString(
    "en-US",
  )} items. You already have ${counts.items.toLocaleString(
    "en-US",
  )} items recorded. Upgrade your plan to track additional items.`;
}

/* ========== Public guard helpers ========== */

export async function ensureCanAddCollection(userId: string): Promise<void> {
  if (!userId) {
    throw new CollectionLimitError("You must be signed in to create collections.");
  }

  const [plan, counts] = await Promise.all([
    getUserPlan(userId),
    getCollectionCounts(userId),
  ]);

  if (!canAddCollection(plan, counts.collections)) {
    const caps = planCapabilities(plan);
    throw new CollectionLimitError(
      buildCollectionLimitMessage(plan, counts),
      {
        planId: plan.id,
        maxCollections: caps.maxCollections,
        currentCollections: counts.collections,
      },
    );
  }
}

export async function ensureCanAddItem(userId: string): Promise<void> {
  if (!userId) {
    throw new ItemLimitError("You must be signed in to add items.");
  }

  const [plan, counts] = await Promise.all([
    getUserPlan(userId),
    getCollectionCounts(userId),
  ]);

  if (!canAddItem(plan, counts.items)) {
    const caps = planCapabilities(plan);
    throw new ItemLimitError(
      buildItemLimitMessage(plan, counts),
      {
        planId: plan.id,
        maxItems: caps.maxItemsTotal,
        currentItems: counts.items,
      },
    );
  }
}
