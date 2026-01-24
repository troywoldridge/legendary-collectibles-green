"use server";

import "server-only";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

function norm(v: unknown): string {
  return String(v ?? "").trim();
}

function boolFromCheckbox(fd: FormData, key: string): boolean {
  return fd.get(key) != null; // checkbox => present = "on"
}

function intOrNull(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export async function upsertFunkoFromForm(formData: FormData) {
  try {
    const rawId = norm(formData.get("id"));
    const upc = norm(formData.get("upc"));

    // Require at least id OR upc
    if (!rawId && !upc) {
      redirect(`/admin/funko/new?error=${encodeURIComponent("Missing required field: either ID or UPC.")}`);
    }

    const id = rawId || (upc ? `funko:${upc}` : "");

    const name = norm(formData.get("name")) || null;
    const franchise = norm(formData.get("franchise")) || null;
    const series = norm(formData.get("series")) || null;
    const line = norm(formData.get("line")) || null;
    const number = norm(formData.get("number")) || null;
    const edition = norm(formData.get("edition")) || null;
    const variant = norm(formData.get("variant")) || null;
    const exclusivity = norm(formData.get("exclusivity")) || null;
    const release_year = intOrNull(norm(formData.get("release_year")));
    const description = norm(formData.get("description")) || null;
    const image_small = norm(formData.get("image_small")) || null;
    const image_large = norm(formData.get("image_large")) || null;
    const source = norm(formData.get("source")) || null;
    const source_id = norm(formData.get("source_id")) || null;

    const is_chase = boolFromCheckbox(formData, "is_chase");
    const is_exclusive = boolFromCheckbox(formData, "is_exclusive");

    // extra jsonb (your table default is {}::jsonb)
    let extra: any = {};
    const extraText = norm(formData.get("extra_json"));
    if (extraText) {
      try {
        extra = JSON.parse(extraText);
      } catch {
        extra = { raw: extraText };
      }
    }

    // Upsert into your exact table shape
    const saved =
      (
        await db.execute<{ id: string }>(sql`
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
          )
          VALUES (
            ${id},
            ${name},
            ${franchise},
            ${series},
            ${line},
            ${number},
            ${edition},
            ${variant},
            ${is_chase},
            ${is_exclusive},
            ${exclusivity},
            ${release_year},
            ${upc || null},
            ${description},
            ${image_small},
            ${image_large},
            ${source},
            ${source_id},
            ${JSON.stringify(extra)}::jsonb
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            franchise = EXCLUDED.franchise,
            series = EXCLUDED.series,
            line = EXCLUDED.line,
            number = EXCLUDED.number,
            edition = EXCLUDED.edition,
            variant = EXCLUDED.variant,
            is_chase = EXCLUDED.is_chase,
            is_exclusive = EXCLUDED.is_exclusive,
            exclusivity = EXCLUDED.exclusivity,
            release_year = EXCLUDED.release_year,
            upc = EXCLUDED.upc,
            description = EXCLUDED.description,
            image_small = EXCLUDED.image_small,
            image_large = EXCLUDED.image_large,
            source = EXCLUDED.source,
            source_id = EXCLUDED.source_id,
            extra = EXCLUDED.extra,
            updated_at = now()
          RETURNING id
        `)
      ).rows?.[0] ?? null;

    const finalId = saved?.id ?? id;
    redirect(`/categories/funko/items/${encodeURIComponent(finalId)}`);
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "Unknown error");
    redirect(`/admin/funko/new?error=${encodeURIComponent(msg.slice(0, 300))}`);
  }
}
