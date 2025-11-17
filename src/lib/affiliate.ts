// src/lib/affiliate.ts
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { PricechartingCategory } from "@/lib/pricecharting";

export type Marketplace = "amazon" | "ebay" | "tcgplayer" | "cardmarket";

export type CardAffiliateLink = {
  category: PricechartingCategory;
  card_id: string;
  marketplace: Marketplace;
  url: string;
  notes: string | null;
};

export async function getAffiliateLinkForCard(opts: {
  category: PricechartingCategory;
  cardId: string;
  marketplace: Marketplace;
}): Promise<CardAffiliateLink | null> {
  const { category, cardId, marketplace } = opts;

  const { rows } = await db.execute<CardAffiliateLink>(sql`
    SELECT
      category,
      card_id,
      marketplace,
      url,
      notes
    FROM card_affiliate_links
    WHERE category = ${category}
      AND card_id = ${cardId}
      AND marketplace = ${marketplace}
    LIMIT 1
  `);

  return rows[0] ?? null;
}
