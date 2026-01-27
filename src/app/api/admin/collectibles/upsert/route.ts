// src/app/api/admin/collectibles/upsert/route.ts
import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Admin auth:
 * - Supports:
 *   - Authorization: Bearer <token>
 *   - x-admin-token: <token>
 *   - ?token=<token>
 *
 * Set env: ADMIN_TOKEN
 */
function readHeader(req: NextRequest, name: string) {
  try {
    return req.headers.get(name);
  } catch {
    return null;
  }
}

function getAdminTokenFromRequest(req: NextRequest): string | null {
  const auth = readHeader(req, "authorization") || readHeader(req, "Authorization");
  if (auth) {
    const m = auth.match(/^\s*Bearer\s+(.+)\s*$/i);
    if (m?.[1]) return m[1].trim();
  }

  const x = readHeader(req, "x-admin-token") || readHeader(req, "X-Admin-Token");
  if (x) return x.trim();

  try {
    const url = new URL(req.url);
    const t = url.searchParams.get("token");
    if (t) return t.trim();
  } catch {}

  return null;
}

function norm(v: unknown): string {
  return String(v ?? "").trim();
}

function toBool(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(s)) return true;
    if (["false", "0", "no", "n"].includes(s)) return false;
  }
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  return null;
}

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeUpc(upc: string): string {
  return upc.replace(/\s+/g, "");
}

function makeCanonicalId(id: string, brand: string, upc: string): string {
  if (id) return id;
  if (upc && brand) return `${slugify(brand)}:${normalizeUpc(upc)}`;
  if (upc) return `collectibles:${normalizeUpc(upc)}`;
  return "";
}

type UpsertBody = {
  id?: string;
  brand?: string; // stored inside extra.brand typically
  name?: string;
  franchise?: string;
  series?: string;
  line?: string;
  number?: string;
  edition?: string;
  variant?: string;
  is_chase?: boolean | string | number;
  is_exclusive?: boolean | string | number;
  exclusivity?: string;
  release_year?: number | string;
  upc?: string;
  description?: string;
  image_small?: string;
  image_large?: string;
  source?: string;
  source_id?: string;
  extra?: unknown; // jsonb

  product?: {
    product_id?: string; // uuid (optional)
    slug?: string;
    title?: string;
    subtitle?: string | null;
    price_cents?: number | string;
    quantity?: number | string;
    status?: string;
    compare_at_cents?: number | string | null;
    inventory_type?: string | null;
    shipping_class?: string | null;
    shipping_weight_lbs?: number | string | null; // optional override
  };
};

type ReturnRow = {
  id: string;
  name: string | null;
  upc: string | null;
  updated_at: string;
};

type ProductReturnRow = {
  id: string;
  slug: string;
  title: string;
  game: string;
  format: string;
  price_cents: number;
  quantity: number;
  status: string;
  updated_at: string;
};

export async function POST(req: NextRequest) {
  const expected = norm(process.env.ADMIN_TOKEN);
  const got = getAdminTokenFromRequest(req);

  if (!expected || !got || got !== expected) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing or invalid admin token." },
      { status: 401 },
    );
  }

  let body: UpsertBody;
  try {
    body = (await req.json()) as UpsertBody;
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 });
  }

  const id0 = norm(body.id);
  const upc0 = norm(body.upc);
  const brand0 = norm(body.brand);

  // Require at least one stable identifier
  if (!id0 && !upc0) {
    return NextResponse.json(
      { error: "bad_request", message: "Provide at least { id } or { upc }." },
      { status: 400 },
    );
  }

  const canonicalId = makeCanonicalId(id0, brand0, upc0);
  if (!canonicalId) {
    return NextResponse.json(
      { error: "bad_request", message: "Unable to mint a canonical id." },
      { status: 400 },
    );
  }

  const isChase = toBool(body.is_chase);
  const isExclusive = toBool(body.is_exclusive);
  const releaseYear = toInt(body.release_year);

  // extra must be JSON-ish; if not provided keep {}, if string try parse, else store as-is
  let extra: any = {};
  if (body.extra !== undefined) {
    if (typeof body.extra === "string") {
      const s = body.extra.trim();
      if (!s) extra = {};
      else {
        try {
          extra = JSON.parse(s);
        } catch {
          extra = { raw: s };
        }
      }
    } else {
      extra = body.extra;
    }
  }

  // ensure extra.brand if body.brand provided
  if (brand0) {
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) extra = {};
    if (!("brand" in extra) || !String((extra as any).brand ?? "").trim()) {
      (extra as any).brand = brand0;
    }
  }

  const upc = upc0 ? normalizeUpc(upc0) : "";

  const item =
    (
      await db.execute<ReturnRow>(sql`
        INSERT INTO public.collectibles_items (
          id,
          name,
          franchise,
          series,
          line,
          number,
          edition,
          variant,
          is_chase,
          is_exclusive,
          exclusivity,
          release_year,
          upc,
          description,
          image_small,
          image_large,
          source,
          source_id,
          extra
        ) VALUES (
          ${canonicalId},
          ${norm(body.name) || null},
          ${norm(body.franchise) || null},
          ${norm(body.series) || null},
          ${norm(body.line) || null},
          ${norm(body.number) || null},
          ${norm(body.edition) || null},
          ${norm(body.variant) || null},
          ${isChase ?? false},
          ${isExclusive ?? false},
          ${norm(body.exclusivity) || null},
          ${releaseYear},
          ${upc || null},
          ${norm(body.description) || null},
          ${norm(body.image_small) || null},
          ${norm(body.image_large) || null},
          ${norm(body.source) || null},
          ${norm(body.source_id) || null},
          COALESCE(${extra}::jsonb, '{}'::jsonb)
        )
        ON CONFLICT (id) DO UPDATE SET
          name = COALESCE(EXCLUDED.name, public.collectibles_items.name),
          franchise = COALESCE(EXCLUDED.franchise, public.collectibles_items.franchise),
          series = COALESCE(EXCLUDED.series, public.collectibles_items.series),
          line = COALESCE(EXCLUDED.line, public.collectibles_items.line),
          number = COALESCE(EXCLUDED.number, public.collectibles_items.number),
          edition = COALESCE(EXCLUDED.edition, public.collectibles_items.edition),
          variant = COALESCE(EXCLUDED.variant, public.collectibles_items.variant),
          is_chase = EXCLUDED.is_chase,
          is_exclusive = EXCLUDED.is_exclusive,
          exclusivity = COALESCE(EXCLUDED.exclusivity, public.collectibles_items.exclusivity),
          release_year = COALESCE(EXCLUDED.release_year, public.collectibles_items.release_year),
          upc = COALESCE(EXCLUDED.upc, public.collectibles_items.upc),
          description = COALESCE(EXCLUDED.description, public.collectibles_items.description),
          image_small = COALESCE(EXCLUDED.image_small, public.collectibles_items.image_small),
          image_large = COALESCE(EXCLUDED.image_large, public.collectibles_items.image_large),
          source = COALESCE(EXCLUDED.source, public.collectibles_items.source),
          source_id = COALESCE(EXCLUDED.source_id, public.collectibles_items.source_id),
          extra = CASE
            WHEN EXCLUDED.extra IS NULL OR EXCLUDED.extra = '{}'::jsonb THEN public.collectibles_items.extra
            ELSE EXCLUDED.extra
          END
        RETURNING id, name, upc, updated_at::text AS updated_at
      `)
    ).rows?.[0] ?? null;

  if (!item) {
    return NextResponse.json({ error: "server_error", message: "Upsert failed." }, { status: 500 });
  }

  // Optional: upsert into products (only if body.product provided)
  let product: ProductReturnRow | null = null;

  if (body.product) {
    const p = body.product;

    const title = norm(p.title) || norm(body.name) || canonicalId;
    const derivedSlugBase =
      norm(p.slug) || slugify(`${title}${body.number ? ` ${norm(body.number)}` : ""}`);
    const slug = derivedSlugBase || slugify(canonicalId);

    const priceCents = toInt(p.price_cents) ?? 0;
    const quantity = toInt(p.quantity) ?? 1;
    const status = norm(p.status) || "draft";
    const compareAtCents = p.compare_at_cents === null ? null : (toInt(p.compare_at_cents) ?? null);

    const inventoryType = norm(p.inventory_type) || "stock";
    const shippingClass = p.shipping_class ? norm(p.shipping_class) : null;

    const shippingWeightOverride =
      p.shipping_weight_lbs === null || p.shipping_weight_lbs === undefined
        ? null
        : (() => {
            const n = typeof p.shipping_weight_lbs === "number" ? p.shipping_weight_lbs : Number(p.shipping_weight_lbs);
            return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : null;
          })();

    // If no override, try from extra.weight_lb
    const shippingWeightFromExtra =
      typeof extra?.weight_lb === "number" && Number.isFinite(extra.weight_lb)
        ? Math.max(0, Math.round(extra.weight_lb * 100) / 100)
        : null;

    const shippingWeightLbs = shippingWeightOverride ?? shippingWeightFromExtra;

    const productId = norm(p.product_id);
    const hasProductId = !!productId && isUuid(productId);

    const res = await db.execute<ProductReturnRow>(sql`
      ${
        hasProductId
          ? sql`
            INSERT INTO public.products (
              id,
              title,
              subtitle,
              slug,
              game,
              format,
              sealed,
              is_graded,
              price_cents,
              compare_at_cents,
              quantity,
              status,
              inventory_type,
              shipping_class,
              shipping_weight_lbs,
              collectibles_item_id,
              source_card_id
            ) VALUES (
              ${productId}::uuid,
              ${title},
              ${p.subtitle ?? null},
              ${slug},
              'collectibles'::game,
              'single'::product_format,
              false,
              false,
              ${priceCents},
              ${compareAtCents},
              ${quantity},
              ${status}::product_status,
              ${inventoryType}::inventory_type,
              ${shippingClass},
              ${shippingWeightLbs},
              ${canonicalId},
              ${canonicalId}
            )
            ON CONFLICT (id) DO UPDATE SET
              title = EXCLUDED.title,
              subtitle = COALESCE(EXCLUDED.subtitle, public.products.subtitle),
              slug = EXCLUDED.slug,
              game = 'collectibles'::game,
              format = 'single'::product_format,
              sealed = false,
              is_graded = false,
              price_cents = EXCLUDED.price_cents,
              compare_at_cents = COALESCE(EXCLUDED.compare_at_cents, public.products.compare_at_cents),
              quantity = EXCLUDED.quantity,
              status = EXCLUDED.status,
              inventory_type = EXCLUDED.inventory_type,
              shipping_class = EXCLUDED.shipping_class,
              shipping_weight_lbs = EXCLUDED.shipping_weight_lbs,
              collectibles_item_id = EXCLUDED.collectibles_item_id,
              source_card_id = EXCLUDED.source_card_id
          `
          : sql`
            INSERT INTO public.products (
              title,
              subtitle,
              slug,
              game,
              format,
              sealed,
              is_graded,
              price_cents,
              compare_at_cents,
              quantity,
              status,
              inventory_type,
              shipping_class,
              shipping_weight_lbs,
              collectibles_item_id,
              source_card_id
            ) VALUES (
              ${title},
              ${p.subtitle ?? null},
              ${slug},
              'collectibles'::game,
              'single'::product_format,
              false,
              false,
              ${priceCents},
              ${compareAtCents},
              ${quantity},
              ${status}::product_status,
              ${inventoryType}::inventory_type,
              ${shippingClass},
              ${shippingWeightLbs},
              ${canonicalId},
              ${canonicalId}
            )
            ON CONFLICT (slug) DO UPDATE SET
              title = EXCLUDED.title,
              subtitle = COALESCE(EXCLUDED.subtitle, public.products.subtitle),
              game = 'collectibles'::game,
              format = 'single'::product_format,
              sealed = false,
              is_graded = false,
              price_cents = EXCLUDED.price_cents,
              compare_at_cents = COALESCE(EXCLUDED.compare_at_cents, public.products.compare_at_cents),
              quantity = EXCLUDED.quantity,
              status = EXCLUDED.status,
              inventory_type = EXCLUDED.inventory_type,
              shipping_class = EXCLUDED.shipping_class,
              shipping_weight_lbs = EXCLUDED.shipping_weight_lbs,
              collectibles_item_id = EXCLUDED.collectibles_item_id,
              source_card_id = EXCLUDED.source_card_id
          `
      }
      RETURNING
        id::text AS id,
        slug,
        title,
        game::text AS game,
        format::text AS format,
        price_cents,
        quantity,
        status::text AS status,
        updated_at::text AS updated_at
    `);

    product = res.rows?.[0] ?? null;
  }

  return NextResponse.json({ ok: true, item, product });
}
