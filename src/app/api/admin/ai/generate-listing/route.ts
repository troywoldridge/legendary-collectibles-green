/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import fs from "node:fs";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { ListingJsonSchema, type ListingJson, PHOTO_NOTE_LITERAL } from "@/lib/ai/listingSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function safeJsonParse(s: string): unknown {
  return JSON.parse(String(s ?? "").trim());
}

/**
 * Load the generator prompt.
 * Priority:
 *  1) LISTING_GENERATOR_PROMPT env var (optional override)
 *  2) src/content/ai/listing-generator-prompt.md (repo source of truth)
 */
function loadGeneratorPrompt(): string {
  const envPrompt = process.env.LISTING_GENERATOR_PROMPT;
  if (envPrompt && envPrompt.trim()) return envPrompt.trim();

  const p = path.join(process.cwd(), "src", "content", "ai", "listing-generator-prompt.md");
  if (!fs.existsSync(p)) {
    throw new Error(
      `Missing generator prompt. Set env LISTING_GENERATOR_PROMPT or create file: ${p}`,
    );
  }
  const text = fs.readFileSync(p, "utf8").trim();
  if (!text) throw new Error(`Generator prompt file is empty: ${p}`);
  return text;
}

/**
 * Plug your provider here (OpenAI, local model, etc.)
 * Return { text } where text is the model’s raw JSON output string.
 */
async function callModel(prompt: string): Promise<{ text: string; model?: string }> {
  // TODO: wire to your provider
  void prompt;
  throw new Error("callModel() is not wired yet. Connect your LLM provider here.");
}

function buildGeneratorPrompt(input: any) {
  const base = loadGeneratorPrompt();
  return `${base}\n\nINPUT_JSON:\n${JSON.stringify(input, null, 2)}`;
}

function sanitizeListingJson(x: ListingJson): ListingJson {
  // Force the stock-safe literal exactly
  x.copy.photoAssumptionNote = PHOTO_NOTE_LITERAL;

  // Remove/neutralize dangerous “exact item” claims if the model tries anyway
  const banned: RegExp[] = [
    /photos represent the exact item you will receive/gi,
    /photos show the exact item you will receive/gi,
    /exact item you will receive/gi,
    /exact item shown/gi,
  ];

  const scrub = (s: string | null) => {
    if (!s) return s;
    let out = s;
    for (const re of banned) out = out.replace(re, "photos may include stock images");
    out = out.replace(/\s{2,}/g, " ").replace(/\s+\n/g, "\n").trim();
    return out;
  };

  x.copy.shortTitle = scrub(x.copy.shortTitle);
  x.copy.listingTitle = scrub(x.copy.listingTitle);
  x.copy.descriptionMd = scrub(x.copy.descriptionMd);
  x.copy.conditionNote = scrub(x.copy.conditionNote);
  x.copy.gradingNote = scrub(x.copy.gradingNote);
  x.copy.shippingSafetyNote = scrub(x.copy.shippingSafetyNote);
  x.copy.highlights = (x.copy.highlights || []).map((h) => scrub(h) ?? "").filter(Boolean);

  // Remove duplicate literal line if it appears in description
  if (x.copy.descriptionMd) {
    const lines = x.copy.descriptionMd.split("\n");
    const filtered = lines.filter((ln) => ln.trim() !== PHOTO_NOTE_LITERAL);
    x.copy.descriptionMd = filtered.join("\n").trim();
  }

  return x;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productId = norm(body?.productId);
    if (!productId) {
      return NextResponse.json({ error: "bad_request", message: "Missing productId" }, { status: 400 });
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
      return NextResponse.json({ error: "not_found", message: "Product not found" }, { status: 404 });
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

    // Optional: tcg enrichment
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
    let validated: ListingJson = ListingJsonSchema.parse(parsed);

    validated = sanitizeListingJson(validated);

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
