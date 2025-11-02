// src/lib/catalog.ts
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { asc, inArray } from "drizzle-orm";

// Fetch all categories (or limit)
export async function getCategories(limit?: number) {
  const results = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sort_order))
    .limit(limit ?? 20);

  // Convert to shape used in your page
  return results.map((cat) => ({
    slug: cat.slug,
    name: cat.name,
    description: cat.description,
    image: cat.cf_image_id
      ? `https://imagedelivery.net/pJ0fKvjCAbyoF8aD0BGu8Q/${cat.cf_image_id}/public`
      : null,
  }));
}

// Optional helper for featured ones by slug
export async function getCategoriesBySlugs(slugs: string[]) {
  const results = await db
    .select()
    .from(categories)
    .where(
      eq(categories.slug, slugs[0]) // drizzle can’t do IN yet — we can expand manually
    );

  return results.map((cat) => ({
    slug: cat.slug,
    name: cat.name,
    description: cat.description,
    image: cat.cf_image_id
      ? `https://imagedelivery.net/pJ0fKvjCAbyoF8aD0BGu8Q/${cat.cf_image_id}/public`
      : null,
  }));
}
