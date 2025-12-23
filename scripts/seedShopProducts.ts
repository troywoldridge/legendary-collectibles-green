import "dotenv/config";
import { sql } from "drizzle-orm";

// RELATIVE imports (no @/)
import { db } from "../src/lib/db";
import { products, productImages } from "../src/lib/db/schema/shop";
import { CF_ACCOUNT_HASH } from "../src/lib/cf";

const CF_VARIANT = "public";

function cfDeliveryUrl(imageId: string, variant = CF_VARIANT) {
  return `https://imagedelivery.net/${CF_ACCOUNT_HASH}/${imageId}/${variant}`;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type SeedItem = {
  name: string;
  cfId: string;
  setCode: string;
  cardNo: string;
  priceCents: number;
};

const ITEMS: SeedItem[] = [
  { name: "Sableye", cfId: "xyp-xy92-large-1a9c8543a767", setCode: "xyp", cardNo: "XY92", priceCents: 399 },
  { name: "Gallade", cfId: "xy8-84-large-0b38bbd30850", setCode: "xy8", cardNo: "84/162", priceCents: 249 },
  { name: "Dialga", cfId: "xyp-xy77-large-757806b6e4c0", setCode: "xyp", cardNo: "XY77", priceCents: 499 },
  { name: "Flareon", cfId: "xy7-13-large-7dbf49f212de", setCode: "xy7", cardNo: "13/98", priceCents: 599 },
];

async function main() {
  console.log("== Seed starting ==");
  console.log("DATABASE_URL set:", Boolean(process.env.DATABASE_URL));
  console.log("CF_ACCOUNT_HASH:", CF_ACCOUNT_HASH);

  for (const it of ITEMS) {
    const title = `${it.name} (${it.cardNo})`;
    const slug = slugify(`pokemon-${it.name}-${it.cardNo}`);

    console.log("Upserting:", { title, slug });

    // ✅ Drizzle here: returning() takes NO args in your version
    const insertedRows = await db
      .insert(products)
      .values({
        title,
        slug,
        game: "pokemon",
        format: "single",
        sealed: false,
        isGraded: false,
        grader: null,
        gradeX10: null,
        condition: "nm",
        priceCents: it.priceCents,
        compareAtCents: null,
        inventoryType: "stock",
        quantity: 1,
        status: "active",
        subtitle: `${it.setCode.toUpperCase()} • #${it.cardNo}`,
        description: `Pokémon single. Set: ${it.setCode.toUpperCase()}. Card: ${it.cardNo}.`,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: products.slug,
        set: {
          title,
          priceCents: it.priceCents,
          subtitle: `${it.setCode.toUpperCase()} • #${it.cardNo}`,
          description: `Pokémon single. Set: ${it.setCode.toUpperCase()}. Card: ${it.cardNo}.`,
          status: "active",
          inventoryType: "stock",
          quantity: 1,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    const row: any = insertedRows?.[0];
    const productId: string | undefined = row?.id;

    if (!productId) {
      console.error("Insert returned:", insertedRows);
      throw new Error(`No product id returned for slug=${slug}`);
    }

    // deterministic: ensure exactly one primary image (sort=0)
    await db.delete(productImages).where(sql`${productImages.productId} = ${productId} AND ${productImages.sort} = 0`);

    const url = cfDeliveryUrl(it.cfId, CF_VARIANT);

    await db.insert(productImages).values({
      productId,
      url,
      alt: title,
      sort: 0,
      createdAt: sql`now()`,
    });

    console.log("✅ Seeded:", productId, slug, url);
  }

  console.log("== Seed finished ==");
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
