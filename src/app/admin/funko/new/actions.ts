// src/app/admin/funko/new/actions.ts
"use server";

import "server-only";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// Turbopack/Next throws redirect as an exception; do NOT swallow it.
function isNextRedirect(e: unknown) {
  return typeof e === "object" && e !== null && "digest" in e && (e as any).digest === "NEXT_REDIRECT";
}

function s(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function sNull(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  return t.length ? t : null;
}

function b(v: FormDataEntryValue | null): boolean {
  // checkbox returns "on" when checked
  return String(v ?? "").toLowerCase() === "on";
}

function intNull(v: FormDataEntryValue | null): number | null {
  const t = s(v);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function cleanUrl(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  if (!t) return null;
  // basic sanity — allow http(s) only
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

function parseTagsText(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((v, i, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i);
}

function parseExtraJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    throw new Error("extra_json must be a JSON object.");
  } catch (e: any) {
    throw new Error(
      typeof e?.message === "string" && e.message.trim()
        ? `extra_json is not valid JSON: ${e.message.trim()}`
        : "extra_json is not valid JSON.",
    );
  }
}

export async function upsertFunkoFromForm(formData: FormData) {
  const backTo = "/admin/funko/new";

  try {
    const idRaw = sNull(formData.get("id"));
    const upcRaw = sNull(formData.get("upc"));
    const upc = upcRaw ? upcRaw.replace(/\s+/g, "") : null;

    // If no id provided, require UPC to generate id
    const id = idRaw ?? (upc ? `funko:${upc}` : null);
    if (!id) {
      redirect(
        `${backTo}?error=${encodeURIComponent(
          "Missing id. Provide a Canonical ID or a UPC to auto-generate one.",
        )}`,
      );
    }

    // Core fields
    const name = sNull(formData.get("name"));
    const franchise = sNull(formData.get("franchise"));
    const series = sNull(formData.get("series"));
    const line = sNull(formData.get("line"));
    const number = sNull(formData.get("number"));
    const edition = sNull(formData.get("edition"));
    const variant = sNull(formData.get("variant"));
    const exclusivity = sNull(formData.get("exclusivity"));
    const releaseYear = intNull(formData.get("release_year"));

    const isChase = b(formData.get("is_chase"));
    const isExclusive = b(formData.get("is_exclusive"));

    const description = sNull(formData.get("description"));
    const source = sNull(formData.get("source"));
    const sourceId = sNull(formData.get("source_id"));

    const imageSmall = cleanUrl(formData.get("image_small"));
    const imageLarge = cleanUrl(formData.get("image_large"));

    // Tags/notes (used to generate/ensure extra keys even if extra_json is empty)
    const tagsText = sNull(formData.get("tags_text"));
    const extraNotes = sNull(formData.get("extra_notes"));
    const tags = parseTagsText(tagsText);

    // Extra JSON (manual or auto-generated in client)
    const extraJsonRaw = sNull(formData.get("extra_json"));
    const parsedExtra = parseExtraJson(extraJsonRaw);

    // Merge policy:
    // - prefer parsedExtra for custom keys
    // - ensure tags + notes exist (unless parsedExtra explicitly sets them)
    const mergedExtra: Record<string, unknown> = {
      ...(parsedExtra || {}),
    };

    // tags: if parsedExtra.tags is a non-empty array, keep it, else use tags from tags_text
    const peTags = (parsedExtra as any)?.tags;
    if (Array.isArray(peTags) && peTags.length) {
      mergedExtra.tags = peTags;
    } else if (tags.length) {
      mergedExtra.tags = tags;
    }

    // notes: if parsedExtra.notes exists, keep it, else use extra_notes
    if (typeof (parsedExtra as any)?.notes === "string" && (parsedExtra as any).notes.trim()) {
      mergedExtra.notes = (parsedExtra as any).notes.trim();
    } else if (extraNotes) {
      mergedExtra.notes = extraNotes;
    }

    // Gallery images
    const imgMain = cleanUrl(formData.get("img_main"));
    const img1 = cleanUrl(formData.get("img_1"));
    const img2 = cleanUrl(formData.get("img_2"));
    const img3 = cleanUrl(formData.get("img_3"));
    const img4 = cleanUrl(formData.get("img_4"));
    const img5 = cleanUrl(formData.get("img_5"));

    const gallery: Array<{ sort: number; label: string; url: string }> = [];
    if (imgMain) gallery.push({ sort: 0, label: "main", url: imgMain });
    if (img1) gallery.push({ sort: 1, label: "alt-1", url: img1 });
    if (img2) gallery.push({ sort: 2, label: "alt-2", url: img2 });
    if (img3) gallery.push({ sort: 3, label: "alt-3", url: img3 });
    if (img4) gallery.push({ sort: 4, label: "alt-4", url: img4 });
    if (img5) gallery.push({ sort: 5, label: "alt-5", url: img5 });

    await db.transaction(async (tx) => {
      // Upsert funko_items
      await tx.execute(sql`
        INSERT INTO public.funko_items (
          id, name, franchise, series, line, number, edition, variant,
          is_chase, is_exclusive, exclusivity, release_year, upc,
          description, image_small, image_large, source, source_id, extra
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
          ${isChase},
          ${isExclusive},
          ${exclusivity},
          ${releaseYear},
          ${upc},
          ${description},
          ${imageSmall},
          ${imageLarge},
          ${source},
          ${sourceId},
          ${mergedExtra}::jsonb
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
      `);

      // Upsert gallery images (no deletes; only writes what you provided)
      for (const g of gallery) {
        await tx.execute(sql`
          INSERT INTO public.funko_item_images (item_id, sort_order, label, url)
          VALUES (${id}, ${g.sort}, ${g.label}, ${g.url})
          ON CONFLICT (item_id, sort_order) DO UPDATE SET
            label = EXCLUDED.label,
            url = EXCLUDED.url,
            updated_at = now()
        `);
      }
    });

    redirect(`/categories/funko/items/${encodeURIComponent(id)}?ok=1`);
  } catch (e: any) {
    if (isNextRedirect(e)) throw e;

    const msg =
      typeof e?.message === "string" && e.message.trim()
        ? e.message.trim()
        : "Failed to save Funko item.";

    redirect(`/admin/funko/new?error=${encodeURIComponent(msg)}`);
  }
}
