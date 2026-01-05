// src/lib/catalog.ts
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { asc, inArray } from "drizzle-orm";

// Fetch all categories (or limit)
export async function getCategories(limit?: number) {
  const results = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder))
    .limit(limit ?? 20);

  return results.map((cat) => ({
    slug: cat.slug,
    name: cat.name,
    description: cat.description,
    image: cat.cfImageId
      ? `https://imagedelivery.net/pJ0fKvjCAbyoF8aD0BGu8Q/${cat.cfImageId}/public`
      : null,
    imageAlt: cat.cfAlt ?? null,
  }));
}

// Helper for featured ones by slug
export async function getCategoriesBySlugs(slugs: string[]) {
  const clean = (slugs ?? []).map((s) => String(s).trim()).filter(Boolean);
  if (!clean.length) return [];

  const results = await db
    .select()
    .from(categories)
    .where(inArray(categories.slug, clean))
    .orderBy(asc(categories.sortOrder));

  return results.map((cat) => ({
    slug: cat.slug,
    name: cat.name,
    description: cat.description,
    image: cat.cfImageId
      ? `https://imagedelivery.net/pJ0fKvjCAbyoF8aD0BGu8Q/${cat.cfImageId}/public`
      : null,
    imageAlt: cat.cfAlt ?? null,
  }));
}
