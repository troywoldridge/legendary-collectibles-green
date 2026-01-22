/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import fs from "node:fs";
import path from "node:path";

import OpenAI from "openai";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { ListingJsonSchema, type ListingJson, PHOTO_NOTE_LITERAL } from "@/lib/ai/listingSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function norm(v: unknown) {
  return String(v ?? "").trim();
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
  if (!fs.existsSync(p)) throw new Error(`Missing generator prompt file: ${p}`);

  const text = fs.readFileSync(p, "utf8").trim();
  if (!text) throw new Error(`Generator prompt file is empty: ${p}`);
  return text;
}

/**
 * JSON Schema used for Structured Outputs (strict).
 * This mirrors your Zod schema shape.
 */
const LISTING_JSON_SCHEMA: any = {
  name: "legendary_listing_json_v1",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "product", "tcg", "copy", "seo", "integrity"],
    properties: {
      schemaVersion: { type: "string", const: "1.0.0" },

      product: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "sku",
          "slug",
          "title",
          "subtitle",
          "game",
          "format",
          "sealed",
          "isGraded",
          "grader",
          "gradeX10",
          "gradeLabel",
          "psaDescriptor",
          "conditionCode",
          "conditionLabel",
          "inventoryType",
          "quantity",
          "status",
          "priceCents",
          "compareAtCents",
        ],
        properties: {
          id: { type: ["string", "null"] },
          sku: { type: ["string", "null"] },
          slug: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          subtitle: { type: ["string", "null"] },
          game: { type: ["string", "null"] },
          format: { type: ["string", "null"] },
          sealed: { type: ["boolean", "null"] },

          isGraded: { type: ["boolean", "null"] },
          grader: { type: ["string", "null"] },
          gradeX10: { type: ["integer", "null"] },
          gradeLabel: { type: ["string", "null"] },
          psaDescriptor: { type: ["string", "null"] },

          conditionCode: { type: ["string", "null"] },
          conditionLabel: { type: ["string", "null"] },

          inventoryType: { type: ["string", "null"] },
          quantity: { type: ["integer", "null"] },
          status: { type: ["string", "null"] },

          priceCents: { type: ["integer", "null"] },
          compareAtCents: { type: ["integer", "null"] },
        },
      },

      tcg: {
        type: "object",
        additionalProperties: false,
        required: [
          "cardId",
          "setId",
          "setName",
          "setSeries",
          "setReleaseDate",
          "number",
          "rarity",
          "artist",
          "imageSmall",
          "imageLarge",
        ],
        properties: {
          cardId: { type: ["string", "null"] },
          setId: { type: ["string", "null"] },
          setName: { type: ["string", "null"] },
          setSeries: { type: ["string", "null"] },
          setReleaseDate: { type: ["string", "null"] },
          number: { type: ["string", "null"] },
          rarity: { type: ["string", "null"] },
          artist: { type: ["string", "null"] },
          imageSmall: { type: ["string", "null"] },
          imageLarge: { type: ["string", "null"] },
        },
      },

      copy: {
        type: "object",
        additionalProperties: false,
        required: [
          "shortTitle",
          "listingTitle",
          "highlights",
          "descriptionMd",
          "conditionNote",
          "gradingNote",
          "shippingSafetyNote",
          "photoAssumptionNote",
        ],
        properties: {
          shortTitle: { type: ["string", "null"] },
          listingTitle: { type: ["string", "null"] },
          highlights: { type: "array", items: { type: "string" } },
          descriptionMd: { type: ["string", "null"] },
          conditionNote: { type: ["string", "null"] },
          gradingNote: { type: ["string", "null"] },
          shippingSafetyNote: { type: ["string", "null"] },

          // IMPORTANT: OpenAI json_schema needs a "type" alongside "const"
          photoAssumptionNote: { type: "string", const: PHOTO_NOTE_LITERAL },
        },
      },

      seo: {
        type: "object",
        additionalProperties: false,
        required: ["metaTitle", "metaDescription", "keywords"],
        properties: {
          metaTitle: { type: ["string", "null"] },
          metaDescription: { type: ["string", "null"] },
          keywords: { type: "array", items: { type: "string" } },
        },
      },

      integrity: {
        type: "object",
        additionalProperties: false,
        required: [
          "noHypeLanguage",
          "noUnverifiedClaims",
          "noInventedConditionOrGrade",
          "collectorSafe",
          "photoAware",
          "notes",
        ],
        properties: {
          // IMPORTANT: add "type" alongside "const" for all of these
          noHypeLanguage: { type: "boolean", const: true },
          noUnverifiedClaims: { type: "boolean", const: true },
          noInventedConditionOrGrade: { type: "boolean", const: true },
          collectorSafe: { type: "boolean", const: true },
          photoAware: { type: "boolean", const: true },
          notes: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};


function sanitizeListingJson(x: ListingJson): ListingJson {
  // Force the stock-safe literal exactly
  x.copy.photoAssumptionNote = PHOTO_NOTE_LITERAL;

  // Remove/neutralize “exact item” claims if the model tries anyway
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

  // If the literal is repeated in description, remove it (we store it separately)
  if (x.copy.descriptionMd) {
    const lines = x.copy.descriptionMd.split("\n");
    const filtered = lines.filter((ln) => ln.trim() !== PHOTO_NOTE_LITERAL);
    x.copy.descriptionMd = filtered.join("\n").trim();
  }

  return x;
}

function buildGeneratorPrompt(input: any) {
  const base = loadGeneratorPrompt();
  return `${base}\n\nINPUT_JSON:\n${JSON.stringify(input, null, 2)}`;
}

async function callModel(prompt: string): Promise<{ json: unknown; model?: string }> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Missing env OPENAI_API_KEY");

  // Put gpt-5-mini here (or set OPENAI_MODEL in env)
  const model = (process.env.OPENAI_MODEL || "gpt-5-mini").trim();

  const resp = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a strict JSON generator. Output must be VALID JSON ONLY and must match the provided json_schema exactly.",
      },
      { role: "user", content: prompt },
    ],
    // Structured Outputs (strict)
    response_format: {
      type: "json_schema",
      json_schema: LISTING_JSON_SCHEMA,
    } as any,
  });

  const text = resp.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") throw new Error("OpenAI returned empty content");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Model output was not valid JSON");
  }

  return { json: parsed, model };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productId = norm(body?.productId);

    if (!productId) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: "Missing productId" },
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
        { ok: false, error: "not_found", message: "Product not found" },
        { status: 404 },
      );
    }

    // images for THIS product
    const imgRes = await db.execute(sql`
      select i.id, i.url, i.alt, i.sort
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
    const { json, model } = await callModel(prompt);

    // Validate + enforce stock-safe note
    let validated: ListingJson = ListingJsonSchema.parse(json);
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
