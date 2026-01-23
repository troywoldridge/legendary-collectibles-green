// src/app/api/admin/ai/generate-listing/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import fs from "node:fs";
import path from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/adminAuth";

import {
  ListingJsonSchema,
  type ListingJson,
  PHOTO_NOTE_LITERAL,
} from "@/lib/ai/listingSchema";

import { LISTING_RULES_V1 } from "@/lib/ai/listingRules";
import { llmText } from "@/lib/ai/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toInt(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toBool(v: unknown, fallback = false) {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

/**
 * Load the generator prompt.
 * Priority:
 *  1) LISTING_GENERATOR_PROMPT env var
 *  2) src/content/ai/listing-generator-prompt.md
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

function sanitizeListingJson(x: ListingJson): ListingJson {
  // Ensure integrity object exists (schema should provide it, but be defensive)
  x.integrity = x.integrity ?? {
    noHypeLanguage: true,
    noUnverifiedClaims: true,
    noInventedConditionOrGrade: true,
    collectorSafe: true,
    photoAware: true,
    notes: [],
  };
  x.integrity.notes = Array.isArray(x.integrity.notes) ? x.integrity.notes : [];

  // Force the literal exactly (single source of truth)
  x.copy.photoAssumptionNote = PHOTO_NOTE_LITERAL;

  // Hype / prohibited claims: REMOVE entirely (robust patterns)
  const hypeBanned: Array<{ re: RegExp; label: string }> = [
    { re: /\bpack[\s\-_/]*fresh\b/gi, label: "pack fresh" },
    { re: /\bminty\b/gi, label: "minty" },
    { re: /\bperfect[\s\-_/]*centering\b/gi, label: "perfect centering" },
    { re: /\binvestment(?:[\s\-_/]*grade)?\b/gi, label: "investment" },
    { re: /\bguarantee(?:d|s)?\b/gi, label: "guarantee/guaranteed" },
    { re: /\bflawless\b/gi, label: "flawless" },
    { re: /\bpristine\b/gi, label: "pristine" },

    // Candidate / contender / should-grade family (EXTRA STRICT)
    { re: /\bpsa[\s\-_/]*10[\s\-_/]*(candidate|contender)\b/gi, label: "PSA 10 candidate/contender" },
    { re: /\b(psa|bgs|cgc)\b[\s\-_/]*(candidate|contender)\b/gi, label: "grader candidate/contender" },
    { re: /\b10\b[\s\-_/]*(candidate|contender)\b/gi, label: "10 candidate/contender" },
    { re: /\bgrad(?:e|ing)\b[\s\-_/]*(candidate|contender)\b/gi, label: "grade/grading candidate/contender" },
    { re: /\bgem\b[\s\-_/]*(candidate|contender)\b/gi, label: "gem candidate/contender" },
    {
      re: /\b(should|would|could|might|may|likely|probably)\b[\s\-_/]*(grade|grades|grading)\b[\s\-_/]*(a[\s\-_/]*)?10\b/gi,
      label: "should/would grade a 10",
    },
    { re: /\b(possible|potential)\b[\s\-_/]*10\b/gi, label: "possible/potential 10" },
  ];

  // “Exact item” claims: REWRITE to stock-safe language
  const exactItemClaims: Array<{ re: RegExp; label: string }> = [
    { re: /photos represent the exact item you will receive/gi, label: "photos represent the exact item you will receive" },
    { re: /photos show the exact item you will receive/gi, label: "photos show the exact item you will receive" },
    { re: /exact item you will receive/gi, label: "exact item you will receive" },
    { re: /exact item shown/gi, label: "exact item shown" },
  ];

  const scrub = (s: string | null) => {
    if (!s) return s;
    let out = s;

    // Helper: remove and log
    const removeAndLog = (re: RegExp, label: string) => {
      if (re.test(out)) {
        out = out.replace(re, "");
        x.integrity.notes.push(`Removed banned phrase: ${label}`);
      }
    };

    // Helper: rewrite and log
    const rewriteAndLog = (re: RegExp, label: string) => {
      if (re.test(out)) {
        out = out.replace(re, "photos may include stock images");
        x.integrity.notes.push(`Rewrote exact-item claim to stock-safe language: ${label}`);
      }
    };

    // 1) remove hype/candidate family phrases
    for (const item of hypeBanned) removeAndLog(item.re, item.label);

    // 2) rewrite exact-item claims
    for (const item of exactItemClaims) rewriteAndLog(item.re, item.label);

    // 3) clean up punctuation/spacing stranded by deletions
    out = out
      .replace(/\s*([,.;:!?])\s*(?=[,.;:!?])/g, "$1") // collapse repeated punctuation
      .replace(/\(\s*\)/g, "") // empty parentheses
      .replace(/\[\s*\]/g, "") // empty brackets
      .replace(/\s{2,}/g, " ") // double spaces
      .replace(/\s+\n/g, "\n") // trim line-leading spaces
      .replace(/\n{3,}/g, "\n\n") // collapse huge blank blocks
      .trim();

    // 4) clean up dangling separators at end of lines
    out = out.replace(/[•\-–—|,;:]+\s*$/gm, "").trim();

    return out;
  };

  x.copy.shortTitle = scrub(x.copy.shortTitle);
  x.copy.listingTitle = scrub(x.copy.listingTitle);
  x.copy.descriptionMd = scrub(x.copy.descriptionMd);
  x.copy.conditionNote = scrub(x.copy.conditionNote);
  x.copy.gradingNote = scrub(x.copy.gradingNote);
  x.copy.shippingSafetyNote = scrub(x.copy.shippingSafetyNote);
  x.copy.highlights = (x.copy.highlights || []).map((h) => scrub(h) ?? "").filter(Boolean);

  // Remove the literal if the model repeats it inside description
  if (x.copy.descriptionMd) {
    const lines = x.copy.descriptionMd.split("\n");
    const filtered = lines.filter((ln) => ln.trim() !== PHOTO_NOTE_LITERAL);
    if (filtered.length !== lines.length) {
      x.integrity.notes.push("Removed duplicated photoAssumptionNote literal from descriptionMd.");
    }
    x.copy.descriptionMd = filtered.join("\n").trim();
  }

  // De-dupe notes (models can repeat phrases across fields)
  x.integrity.notes = Array.from(new Set(x.integrity.notes));

  return x;
}



function buildGeneratorPrompt(input: unknown) {
  const base = loadGeneratorPrompt();
  return `${LISTING_RULES_V1}\n\n${base}\n\nINPUT_JSON:\n${JSON.stringify(input, null, 2)}`;
}

/* ---------------- JSON parsing helpers ---------------- */

function extractFirstJsonObject(text: string): string {
  const s = String(text ?? "").trim();
  if (!s) return s;

  // If it's already pure JSON
  if (s.startsWith("{") && s.endsWith("}")) return s;

  // Try to find the first {...} block
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) return s.slice(start, end + 1).trim();

  return s;
}

function parseListingJsonOrThrow(text: string): ListingJson {
  const jsonText = extractFirstJsonObject(text);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Model did not return valid JSON. Got: ${jsonText.slice(0, 220)}...`);
  }

  return ListingJsonSchema.parse(parsed);
}

async function callModel(prompt: string): Promise<{ json: ListingJson; model?: string }> {
  const system =
    "You generate collector-safe listing JSON. Output MUST be valid JSON and MUST match the schema exactly. " +
    "Never invent condition/grade. Treat stock images as non-authoritative. " +
    "If any image is marked isStock=true, do NOT claim the photos show the exact item. " +
    "Return ONLY JSON. No markdown. No commentary. No code fences.";

  // 1st attempt (auto provider: try Ollama, fall back to OpenAI)
  const first = await llmText({
    json: true,
    temperature: 0.2,
    maxTokens: 1800,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });

  try {
    const json = parseListingJsonOrThrow(first.content);
    return { json, model: `${first.provider}:${first.model}` };
  } catch (err1: any) {
    const repairPrompt =
      `${prompt}\n\n` +
      `The previous output was invalid or didn't match schema.\n` +
      `Fix it and return ONLY valid JSON matching the schema exactly.\n` +
      `Error: ${String(err1?.message ?? err1)}`;

    const second = await llmText({
      json: true,
      temperature: 0.1,
      maxTokens: 2000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: repairPrompt },
      ],
    });

    const json2 = parseListingJsonOrThrow(second.content);
    return { json: json2, model: `${second.provider}:${second.model}` };
  }
}

/* ---------------- DB row mapping (NO unsafe casts) ---------------- */

type ProductRow = Record<string, unknown>;

type ImageRow = {
  id: string;
  url: string;
  alt: string | null;
  sort: number;
  isStock: boolean;
};

function mapSingleRow(res: unknown): ProductRow | null {
  const rows = (res as { rows?: unknown })?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const first = rows[0];
  return isObject(first) ? (first as ProductRow) : null;
}

function mapImages(res: unknown): ImageRow[] {
  const rows = (res as { rows?: unknown })?.rows;
  if (!Array.isArray(rows)) return [];

  const out: ImageRow[] = [];
  for (const r of rows) {
    if (!isObject(r)) continue;

    const id = typeof r.id === "string" ? r.id : null;
    const url = typeof r.url === "string" ? r.url : null;
    const alt = r.alt === null ? null : typeof r.alt === "string" ? r.alt : null;
    const sort = toInt(r.sort, 0);
    const isStock = toBool(r.isStock, false);

    if (!id || !url) continue;
    out.push({ id, url, alt, sort, isStock });
  }

  return out;
}

function pickReturningId(res: unknown): string | null {
  const rows = (res as { rows?: unknown })?.rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const first = rows[0];
  if (!isObject(first)) return null;

  const id = (first as any).id;
  return typeof id === "string" ? id : null;
}

/* ---------------- Route ---------------- */

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: auth.error },
      { status: 401 },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const productId = norm(body?.productId);

    if (!productId) {
      return NextResponse.json(
        { ok: false, error: "bad_request", message: "Missing productId" },
        { status: 400 },
      );
    }

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

    const product = mapSingleRow(pRes);
    if (!product) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "Product not found" },
        { status: 404 },
      );
    }

    const imgRes = await db.execute(sql`
      select
        i.id,
        i.url,
        i.alt,
        i.sort,
        i.is_stock as "isStock"
      from product_images i
      where i.product_id = ${productId}::uuid
      order by i.sort asc, i.created_at asc
    `);

    const images = mapImages(imgRes);

    let tcgCard: Record<string, unknown> | null = null;
    const sourceCardId = product["sourceCardId"];

    if (typeof sourceCardId === "string" && sourceCardId.trim()) {
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
          where c.id = ${sourceCardId}
          limit 1
        `);

        tcgCard = mapSingleRow(tcgRes);
      } catch {
        tcgCard = null;
      }
    }

    const input = { product, images, tcgCard };

    const prompt = buildGeneratorPrompt(input);
    const { json, model } = await callModel(prompt);

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

    const generationId = pickReturningId(ins);

    return NextResponse.json({ ok: true, generationId, output: validated });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: "generation_failed", message: String(err?.message ?? err) },
      { status: 500 },
    );
  }
}
