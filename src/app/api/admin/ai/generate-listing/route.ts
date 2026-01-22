/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import fs from "node:fs";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { ListingJsonSchema, type ListingJson } from "@/lib/ai/listingSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- prompt loading (file-based) ---------------- */

const PROMPT_PATH = path.join(process.cwd(), "src/content/ai/listing-generator-prompt.md");
const DBMAP_PATH = path.join(process.cwd(), "src/content/ai/db-mapping.md");

function readTextFile(p: string): string {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing prompt file: ${p}`);
  }
  return fs.readFileSync(p, "utf8");
}

// Read once at module load (fast + stable). If you want hot-reload, move these into buildGeneratorPrompt().
const BASE_PROMPT = readTextFile(PROMPT_PATH);
const DB_MAPPING = readTextFile(DBMAP_PATH);

/* ---------------- utils ---------------- */

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function safeJsonParse(s: string): unknown {
  // Model output must be pure JSON, but guard anyway
  return JSON.parse(String(s ?? "").trim());
}

/**
 * Plug your provider here (OpenAI, local model, etc.)
 * Return { text } where text is the model’s raw JSON output string.
 */
async function callModel(prompt: string): Promise<{ text: string; model?: string }> {
  // TODO: wire to your provider
  void prompt; // satisfies eslint until wired
  throw new Error("callModel() is not wired yet. Connect your LLM provider here.");
}

function buildGeneratorPrompt(input: any) {
  // Generator rules + DB mapping + deterministic input
  return `${BASE_PROMPT}\n\n${DB_MAPPING}\n\nINPUT_JSON:\n${JSON.stringify(input, null, 2)}`;
}

/* ---------------- route ---------------- */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productId = norm(body?.productId);

    if (!productId) {
      return NextResponse.json(
        { error: "bad_request", message: "Missing productId" },
        { status: 400 },
      );
    }

    // product row
    const pRes = await db.execute(sql`
      select
        p.id,
        p.title,
        p.slug,
        p.game::text as game,
        p.format::text as format,
        p.sealed,
        p.is_graded as "isGraded",
        p.grader::text as grader,
        p.grade_x10 as "gradeX10",
        p.condition::text as condition,
        p.price_cents as "priceCents",
        p.compare_at_cents as "compareAtCents",
        p.inventory_type::text as "inventoryType",
        p.quantity,
        p.status::text as status,
        p.subtitle,
        p.description,
        p.sku,
        p.card_kind as "cardKind",
        p.shipping_weight_lbs as "shippingWeightLbs",
        p.shipping_class as "shippingClass",
        p.source_card_id as "sourceCardId",
        p.source_set_code as "sourceSetCode",
        p.source_number as "sourceNumber",
        p.source_set_name as "sourceSetName"
      from products p
      where p.id = ${productId}::uuid
      limit 1
    `);

    const product = (pRes as any)?.rows?.[0];
    if (!product) {
      return NextResponse.json(
        { error: "not_found", message: "Product not found" },
        { status: 404 },
      );
    }

    // images for THIS product
    const imgRes = await db.execute(sql`
      select
        i.id,
        i.url,
        i.alt,
        i.sort
      from product_images i
      where i.product_id = ${productId}::uuid
      order by i.sort asc
    `);
    const images = (imgRes as any)?.rows ?? [];

    // Optional: tcg enrichment (only if tcg_cards exists in this DB)
    let tcgCard: any = null;
    if (product.sourceCardId) {
      try {
        const tcgRes = await db.execute(sql`
          select
            c.id as "cardId",
            c."set.id" as "setId",
            c."set.name" as "setName",
            c."set.series" as "setSeries",
            c."set.releaseDate" as "setReleaseDate",
            c.number,
            c.rarity,
            c.artist,
            c.image_small as "imageSmall",
            c.image_large as "imageLarge"
          from tcg_cards c
          where c.id = ${product.sourceCardId}
          limit 1
        `);
        tcgCard = (tcgRes as any)?.rows?.[0] ?? null;
      } catch {
        tcgCard = null;
      }
    }

    const input = { product, images, tcgCard };

    const prompt = buildGeneratorPrompt(input);
    const { text, model } = await callModel(prompt);

    const parsed = safeJsonParse(text);
    const validated: ListingJson = ListingJsonSchema.parse(parsed);

    const ins = await db.execute(sql`
      insert into ai_listing_generations (product_id, schema_version, output_json, status, model)
      values (
        ${productId}::uuid,
        ${validated.schemaVersion},
        ${JSON.stringify(validated)}::jsonb,
        'draft',
        ${model ?? null}
      )
      returning id
    `);

    const generationId = (ins as any)?.rows?.[0]?.id ?? null;

    return NextResponse.json({ ok: true, generationId, output: validated });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "generation_failed", message: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
