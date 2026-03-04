// src/app/api/pokemon/cards/[id]/variants/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type MapRow = {
  legacy_id: string;
  tcgdex_id: string;
  method: string | null;
  confidence: number | null;
};

type LegacyVariantRow = {
  card_id: string;
  normal: boolean | null;
  reverse: boolean | null;
  holo: boolean | null;
  first_edition: boolean | null;
  w_promo: boolean | null;
};

type TcgdexRow = {
  id: string;
  raw_json: any;
};

type VariantsNormalized = {
  normal: boolean;
  reverse: boolean;
  holo: boolean;
  first_edition: boolean;
  w_promo: boolean;
};

function truthy(v: unknown): boolean {
  return v === true;
}

function normalizeFromTcgdex(raw: any): VariantsNormalized | null {
  const v = raw?.variants ?? null;
  if (!v || typeof v !== "object") return null;

  return {
    normal: truthy(v.normal),
    reverse: truthy(v.reverse),
    holo: truthy(v.holo),
    first_edition: truthy(v.firstEdition),
    w_promo: truthy(v.wPromo),
  };
}

function normalizeFromLegacy(row: LegacyVariantRow | null): VariantsNormalized | null {
  if (!row) return null;
  return {
    normal: row.normal === true,
    reverse: row.reverse === true,
    holo: row.holo === true,
    first_edition: row.first_edition === true,
    w_promo: row.w_promo === true,
  };
}

async function mapLegacyToTcgdex(id: string): Promise<MapRow | null> {
  const res = await db.execute<MapRow>(sql`
    SELECT legacy_id, tcgdex_id, method, confidence
    FROM public.pokemon_card_id_map
    WHERE legacy_id = ${id}
    LIMIT 1
  `);
  return res.rows?.[0] ?? null;
}

async function getTcgdexCard(id: string): Promise<TcgdexRow | null> {
  const res = await db.execute<TcgdexRow>(sql`
    SELECT id::text AS id, raw_json
    FROM public.tcgdex_cards
    WHERE id::text = ${id}::text
    LIMIT 1
  `);
  return res.rows?.[0] ?? null;
}

async function getLegacyVariants(id: string): Promise<LegacyVariantRow | null> {
  const res = await db.execute<LegacyVariantRow>(sql`
    SELECT card_id, normal, reverse, holo, first_edition, w_promo
    FROM public.tcg_card_variants
    WHERE card_id = ${id}
    LIMIT 1
  `);
  return res.rows?.[0] ?? null;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const inputId = decodeURIComponent(id ?? "").trim();

  if (!inputId) {
    return NextResponse.json(
      { ok: false, error: "Missing id" },
      { status: 400 }
    );
  }

  // 1) If input is legacy, try map -> tcgdex
  const mapped = await mapLegacyToTcgdex(inputId);
  const tcgdexId = mapped?.tcgdex_id ? String(mapped.tcgdex_id).trim() : null;

  // 2) Prefer tcgdex variants when possible
  let source: "tcgdex" | "legacy" | "none" = "none";
  let resolvedId = inputId;
  let variants: VariantsNormalized | null = null;

  if (tcgdexId) {
    const tcgdex = await getTcgdexCard(tcgdexId);
    const norm = tcgdex ? normalizeFromTcgdex(tcgdex.raw_json) : null;
    if (norm) {
      source = "tcgdex";
      resolvedId = tcgdexId;
      variants = norm;
    }
  }

  // 3) If not found yet, try tcgdex directly with inputId (maybe input is already tcgdex)
  if (!variants) {
    const tcgdex = await getTcgdexCard(inputId);
    const norm = tcgdex ? normalizeFromTcgdex(tcgdex.raw_json) : null;
    if (norm) {
      source = "tcgdex";
      resolvedId = inputId;
      variants = norm;
    }
  }

  // 4) Final fallback: legacy table
  if (!variants) {
    const legacy = await getLegacyVariants(inputId);
    const norm = normalizeFromLegacy(legacy);
    if (norm) {
      source = "legacy";
      resolvedId = inputId;
      variants = norm;
    }
  }

  return NextResponse.json({
    ok: true,
    inputId,
    resolvedId,
    tcgdexId: tcgdexId,
    mapping: mapped
      ? {
          method: mapped.method ?? null,
          confidence: typeof mapped.confidence === "number" ? mapped.confidence : null,
        }
      : null,
    source,
    variants,
  });
}
