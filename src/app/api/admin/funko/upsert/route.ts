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
 *   - ?token=<token> (handy for quick curl tests)
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

type UpsertBody = {
  id?: string; // preferred: funko:72471
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
  source?: string; // e.g. "supplier"
  source_id?: string; // e.g. "FUKO72471"
  extra?: unknown; // jsonb
};

type ReturnRow = {
  id: string;
  name: string | null;
  upc: string | null;
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

  const id = norm(body.id);
  const upc = norm(body.upc);

  // Require at least one stable identifier
  if (!id && !upc) {
    return NextResponse.json(
      { error: "bad_request", message: "Provide at least { id } or { upc }." },
      { status: 400 },
    );
  }

  // If id missing but UPC present, mint a canonical id.
  // Opinionated: funko:<model_number or last 5 of UPC> is fine; here we use funko:<upc> to be deterministic.
  const canonicalId = id || `funko:${upc}`;

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
          // store raw string if it isn't valid JSON
          extra = { raw: s };
        }
      }
    } else {
      extra = body.extra;
    }
  }

  const row =
    (
      await db.execute<ReturnRow>(sql`
        INSERT INTO public.funko_items (
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
          name = COALESCE(EXCLUDED.name, public.funko_items.name),
          franchise = COALESCE(EXCLUDED.franchise, public.funko_items.franchise),
          series = COALESCE(EXCLUDED.series, public.funko_items.series),
          line = COALESCE(EXCLUDED.line, public.funko_items.line),
          number = COALESCE(EXCLUDED.number, public.funko_items.number),
          edition = COALESCE(EXCLUDED.edition, public.funko_items.edition),
          variant = COALESCE(EXCLUDED.variant, public.funko_items.variant),
          is_chase = EXCLUDED.is_chase,
          is_exclusive = EXCLUDED.is_exclusive,
          exclusivity = COALESCE(EXCLUDED.exclusivity, public.funko_items.exclusivity),
          release_year = COALESCE(EXCLUDED.release_year, public.funko_items.release_year),
          upc = COALESCE(EXCLUDED.upc, public.funko_items.upc),
          description = COALESCE(EXCLUDED.description, public.funko_items.description),
          image_small = COALESCE(EXCLUDED.image_small, public.funko_items.image_small),
          image_large = COALESCE(EXCLUDED.image_large, public.funko_items.image_large),
          source = COALESCE(EXCLUDED.source, public.funko_items.source),
          source_id = COALESCE(EXCLUDED.source_id, public.funko_items.source_id),
          extra = CASE
            WHEN EXCLUDED.extra IS NULL OR EXCLUDED.extra = '{}'::jsonb THEN public.funko_items.extra
            ELSE EXCLUDED.extra
          END
        RETURNING id, name, upc, updated_at::text AS updated_at
      `)
    ).rows?.[0] ?? null;

  if (!row) {
    return NextResponse.json({ error: "server_error", message: "Upsert failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item: row });
}
