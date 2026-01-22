/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { ListingJsonSchema, type ListingJson } from "@/lib/ai/listingSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- utils ---------------- */

function norm(v: unknown) {
  return String(v ?? "").trim();
}

function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toBoolOrNull(v: any): boolean | null {
  if (v === null || v === undefined) return null;
  return !!v;
}

function conditionLabelFromCode(code: string | null): string | null {
  if (!code) return null;
  const c = code.toLowerCase().trim();
  if (c === "nm") return "Near Mint";
  if (c === "lp") return "Lightly Played";
  if (c === "mp") return "Moderately Played";
  if (c === "hp") return "Heavily Played";
  if (c === "dmg") return "Damaged";
  return code; // safe fallback (don’t invent)
}

/** PSA descriptors allowed (PSA only). Keep minimal and safe. */
function psaDescriptorFromGrade(gradeX10: number | null): string | null {
  if (gradeX10 == null) return null;
  if (gradeX10 === 10) return "Gem Mint";
  if (gradeX10 === 9) return "Mint";
  if (gradeX10 === 8) return "Near Mint-Mint";
  if (gradeX10 === 7) return "Near Mint";
  if (gradeX10 === 6) return "Excellent-Mint";
  if (gradeX10 === 5) return "Excellent";
  if (gradeX10 === 4) return "Very Good-Excellent";
  if (gradeX10 === 3) return "Very Good";
  if (gradeX10 === 2) return "Good";
  if (gradeX10 === 1) return "Poor";
  return null;
}

function gradeLabel(grader: string | null, gradeX10: number | null): string | null {
  if (!grader || gradeX10 == null) return null;
  const g = norm(grader).toUpperCase();
  // Your schema says gradeX10 is int; so output integer.
  return `${g} ${gradeX10}`;
}

function moneyUSD(cents: number | null): string | null {
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

function uniq(arr: string[]) {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}

/* ---------------- template generator ---------------- */

function buildTemplateOutput(input: {
  product: any;
  images: any[];
  tcgCard: any | null;
}): ListingJson {
  const p = input.product || {};
  const tcg = input.tcgCard || null;

  const isGraded = !!p.isGraded || !!p.grader || p.gradeX10 != null;

  const grader = p.grader ? String(p.grader) : null;
  const gradeX10 = toIntOrNull(p.gradeX10);
  const gradeLbl = isGraded ? gradeLabel(grader, gradeX10) : null;

  const conditionCode = p.condition ? String(p.condition) : null;
  const conditionLbl = !isGraded ? conditionLabelFromCode(conditionCode) : null;

  const psaDesc =
    isGraded && grader && grader.toUpperCase() === "PSA" ? psaDescriptorFromGrade(gradeX10) : null;

  const setName = norm(p.sourceSetName || "");
  const setCode = norm(p.sourceSetCode || "");
  const number = norm(p.sourceNumber || "");

  const baseName = norm(p.title || "Untitled");

  // Short title: minimal disambiguation, safe, no hype
  const shortTitleParts: string[] = [baseName];
  if (number) shortTitleParts.push(`#${number}`);
  if (setCode) shortTitleParts.push(setCode);
  const shortTitle = shortTitleParts.filter(Boolean).join(" • ") || null;

  // Listing title: include grade OR condition label (not both emphasis)
  const listingTitleParts: string[] = [baseName];

  // Prefer setName if present, else code, but don’t duplicate
  if (setName) listingTitleParts.push(setName);
  else if (setCode) listingTitleParts.push(setCode);

  if (number) listingTitleParts.push(`#${number}`);

  if (isGraded && gradeLbl) {
    listingTitleParts.push(gradeLbl);
    if (psaDesc) listingTitleParts.push(`(${psaDesc})`);
  } else if (!isGraded && conditionLbl) {
    listingTitleParts.push(`(${conditionLbl})`);
  }

  const listingTitle = listingTitleParts.filter(Boolean).join(" • ") || null;

  // Highlights: stable bullets, collector-safe, no claims
  const highlights: string[] = [];

  if (isGraded && gradeLbl) highlights.push(`Graded: ${gradeLbl}${psaDesc ? ` (${psaDesc})` : ""}`);
  if (!isGraded && conditionLbl) highlights.push(`Condition: ${conditionLbl} (see photos)`);

  if (setName || setCode || number) {
    const setBits = [setName || null, setCode || null].filter(Boolean).join(" • ");
    highlights.push(`Set: ${setBits}${number ? ` • Card #${number}` : ""}`.trim());
  }

  const qty = toIntOrNull(p.quantity);
  if (qty != null) highlights.push(`Quantity available: ${qty}`);

  const priceCents = toIntOrNull(p.priceCents);
  if (priceCents != null) highlights.push(`Price: ${moneyUSD(priceCents)}`);

  // Notes that MUST be photo-aware and factual
  const photoAssumptionNote = "Photos represent the exact item you will receive." as const;

  const gradingNote =
    isGraded
      ? `This is a graded card. The slab grade is listed as ${gradeLbl ?? "graded"}.${
          grader?.toUpperCase() === "PSA" && psaDesc ? ` PSA descriptor: ${psaDesc}.` : ""
        }`
      : null;

  const conditionNote =
    !isGraded
      ? conditionLbl
        ? `Condition is listed as ${conditionLbl}. Please review photos for surface, corners, edges, and centering.`
        : `Please review photos for surface, corners, edges, and centering.`
      : null;

  const shippingSafetyNote =
    `Ships securely packaged. Singles are sleeved/toploaded when applicable.`;

  // Description markdown: stable, consistent structure
  const descLines: string[] = [];
  descLines.push(photoAssumptionNote);
  descLines.push("");
  descLines.push("### Details");
  descLines.push(`- Title: ${baseName}`);
  if (setName) descLines.push(`- Set: ${setName}`);
  if (setCode) descLines.push(`- Set code: ${setCode}`);
  if (number) descLines.push(`- Card number: ${number}`);
  if (isGraded && gradeLbl) descLines.push(`- Grade: ${gradeLbl}${psaDesc ? ` (${psaDesc})` : ""}`);
  if (!isGraded && conditionLbl) descLines.push(`- Condition: ${conditionLbl}`);
  if (qty != null) descLines.push(`- Quantity: ${qty}`);
  if (priceCents != null) descLines.push(`- Price: ${moneyUSD(priceCents)}`);
  descLines.push("");
  descLines.push("### Shipping");
  descLines.push(`- ${shippingSafetyNote}`);
  descLines.push("");
  descLines.push("### Important");
  descLines.push("- Please review photos closely before purchasing.");

  const descriptionMd = descLines.join("\n");

  // SEO (safe defaults)
  const metaTitle = listingTitle ? `${listingTitle} • Legendary Collectibles` : null;

  const metaDescription =
    listingTitle
      ? `Buy ${listingTitle}. ${photoAssumptionNote} Fast, secure shipping from Legendary Collectibles.`
      : null;

  const keywords = uniq([
    baseName,
    p.game ? String(p.game) : "",
    p.format ? String(p.format) : "",
    setName,
    setCode,
    number,
    isGraded && gradeLbl ? gradeLbl : "",
    !isGraded && conditionLbl ? conditionLbl : "",
  ]).slice(0, 20);

  // Integrity flags (hard-true) + notes
  const integrityNotes: string[] = [];
  integrityNotes.push("No hype language used.");
  integrityNotes.push("No unverifiable claims made.");
  integrityNotes.push("No grades or conditions invented.");
  integrityNotes.push("Photo-aware language enforced.");

  const out: ListingJson = {
    schemaVersion: "1.0.0",

    product: {
      id: p.id ? String(p.id) : null,
      sku: p.sku ? String(p.sku) : null,
      slug: p.slug ? String(p.slug) : null,
      title: p.title ? String(p.title) : null,
      subtitle: p.subtitle ? String(p.subtitle) : null,
      game: p.game ? String(p.game) : null,
      format: p.format ? String(p.format) : null,
      sealed: toBoolOrNull(p.sealed),

      isGraded: toBoolOrNull(isGraded),
      grader: grader,
      gradeX10: gradeX10,
      gradeLabel: gradeLbl,
      psaDescriptor: psaDesc,

      conditionCode: conditionCode,
      conditionLabel: conditionLbl,

      inventoryType: p.inventoryType ? String(p.inventoryType) : null,
      quantity: qty,
      status: p.status ? String(p.status) : null,

      priceCents: priceCents,
      compareAtCents: toIntOrNull(p.compareAtCents),
    },

    tcg: {
      cardId: tcg?.cardId ? String(tcg.cardId) : null,
      setId: tcg?.setId ? String(tcg.setId) : null,
      setName: tcg?.setName ? String(tcg.setName) : null,
      setSeries: tcg?.setSeries ? String(tcg.setSeries) : null,
      setReleaseDate: tcg?.setReleaseDate ? String(tcg.setReleaseDate) : null,
      number: tcg?.number ? String(tcg.number) : null,
      rarity: tcg?.rarity ? String(tcg.rarity) : null,
      artist: tcg?.artist ? String(tcg.artist) : null,
      imageSmall: tcg?.imageSmall ? String(tcg.imageSmall) : null,
      imageLarge: tcg?.imageLarge ? String(tcg.imageLarge) : null,
    },

    copy: {
      shortTitle,
      listingTitle,
      highlights: uniq(highlights).slice(0, 10),
      descriptionMd,
      conditionNote,
      gradingNote,
      shippingSafetyNote,
      photoAssumptionNote,
    },

    seo: {
      metaTitle,
      metaDescription,
      keywords,
    },

    integrity: {
      noHypeLanguage: true,
      noUnverifiedClaims: true,
      noInventedConditionOrGrade: true,
      collectorSafe: true,
      photoAware: true,
      notes: integrityNotes,
    },
  };

  return out;
}

/* ---------------- handler ---------------- */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productId = norm(body?.productId);

    if (!productId) {
      return NextResponse.json({ ok: false, error: "bad_request", message: "Missing productId" }, { status: 400 });
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
      return NextResponse.json({ ok: false, error: "not_found", message: "Product not found" }, { status: 404 });
    }

    // images for this product
    const imgRes = await db.execute(sql`
      select i.url, i.alt, i.sort
      from product_images i
      where i.product_id = ${productId}::uuid
      order by i.sort asc, i.created_at asc
    `);
    const images = (imgRes as any)?.rows ?? [];

    // tcg enrichment (optional; safe if table missing)
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

    const output = buildTemplateOutput({ product, images, tcgCard });

    // Enforce exact schema always
    const validated: ListingJson = ListingJsonSchema.parse(output);

    const ins = await db.execute(sql`
      insert into ai_listing_generations (product_id, schema_version, output_json, status, model)
      values (
        ${productId}::uuid,
        ${validated.schemaVersion},
        ${JSON.stringify(validated)}::jsonb,
        'draft',
        ${"template" }
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
