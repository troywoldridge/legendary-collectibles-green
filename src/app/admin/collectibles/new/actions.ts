/* eslint-disable @typescript-eslint/no-unused-vars */
// src/app/admin/collectibles/new/actions.ts
"use server";

import "server-only";

import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

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
  if (!/^https?:\/\//i.test(t)) return null;
  return t;
}

function slugify(input: string): string {
  const t = String(input ?? "").trim();
  return t
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseExtraJson(raw: string | null): any {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    return {};
  } catch {
    throw new Error("extra_json is not valid JSON.");
  }
}

function normalizeUpc(upc: string | null): string | null {
  if (!upc) return null;
  const t = upc.replace(/\s+/g, "");
  return t ? t : null;
}

// Canonical id minting:
// - If provided, use it.
// - Else if brand + upc: `${slugify(brand)}:${upc}`
// - Else if upc only: `collectibles:${upc}`
function makeCollectiblesId(idRaw: string | null, brandRaw: string | null, upcRaw: string | null): string | null {
  if (idRaw) return idRaw;
  const upc = normalizeUpc(upcRaw);
  if (!upc) return null;

  const brand = sNull(brandRaw);
  const brandKey = brand ? slugify(brand) : "";
  if (brandKey) return `${brandKey}:${upc}`;
  return `collectibles:${upc}`;
}

function uniqueStringsCaseInsensitive(arr: string[]): string[] {
  const out: string[] = [];
  for (const v of arr) {
    const t = String(v ?? "").trim();
    if (!t) continue;
    if (out.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === -1) out.push(t);
  }
  return out;
}

function moneyToCentsOrZero(v: FormDataEntryValue | null): number {
  const raw0 = s(v);
  if (!raw0) return 0;

  const raw = raw0.replace(/\$/g, "").replace(/,/g, "").trim();
  if (!raw) return 0;

  const hasDot = raw.includes(".");
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;

  let cents: number;
  if (hasDot) cents = Math.round(n * 100);
  else if (Math.abs(n) >= 1000) cents = Math.trunc(n);
  else cents = Math.round(n * 100);

  if (!Number.isFinite(cents)) return 0;
  return Math.max(0, Math.trunc(cents));
}

type TagRow = { id: string; slug: string; name: string };

async function upsertOneTag(tx: any, name: string): Promise<TagRow> {
  const slug = slugify(name);
  if (!slug) throw new Error(`Invalid tag name: "${name}"`);

  const rows = await tx.execute(sql<TagRow>`
    INSERT INTO public.tags (name, slug)
    VALUES (${name}, ${slug})
    ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name
    RETURNING id::text AS id, slug, name
  `);

  const r = (rows as any)?.rows?.[0] as TagRow | undefined;
  if (!r) throw new Error(`Failed to upsert tag: "${name}"`);
  return r;
}

export async function upsertCollectiblesFromForm(formData: FormData) {
  const backTo = "/admin/collectibles/new";

  try {
    const idRaw = sNull(formData.get("id"));
    const upcRaw = sNull(formData.get("upc"));
    const upc = normalizeUpc(upcRaw);

    const brand = sNull(formData.get("brand"));
    const id = makeCollectiblesId(idRaw, brand, upc);
    if (!id) {
      redirect(
        `${backTo}?error=${encodeURIComponent(
          "Missing id. Provide a Canonical ID or a UPC (and ideally Brand) to auto-generate one.",
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

    const extraJsonRaw = sNull(formData.get("extra_json"));
    const extra = parseExtraJson(extraJsonRaw);

    // Gallery images
    const imgMain = cleanUrl(formData.get("img_main"));
    const img1 = cleanUrl(formData.get("img_1"));
    const img2 = cleanUrl(formData.get("img_2"));
    const img3 = cleanUrl(formData.get("img_3"));
    const img4 = cleanUrl(formData.get("img_4"));
    const img5 = cleanUrl(formData.get("img_5"));
    const img6 = cleanUrl(formData.get("img_6"));
    const img7 = cleanUrl(formData.get("img_7"));
    const img8 = cleanUrl(formData.get("img_8"));
    const img9 = cleanUrl(formData.get("img_9"));
    const img10 = cleanUrl(formData.get("img_10"));
    const img11 = cleanUrl(formData.get("img_11"));
    const img12 = cleanUrl(formData.get("img_12"));

    const gallery: Array<{ sort: number; label: string; url: string }> = [];
    if (imgMain) gallery.push({ sort: 0, label: "main", url: imgMain });
    if (img1) gallery.push({ sort: 1, label: "alt-1", url: img1 });
    if (img2) gallery.push({ sort: 2, label: "alt-2", url: img2 });
    if (img3) gallery.push({ sort: 3, label: "alt-3", url: img3 });
    if (img4) gallery.push({ sort: 4, label: "alt-4", url: img4 });
    if (img5) gallery.push({ sort: 5, label: "alt-5", url: img5 });
    if (img6) gallery.push({ sort: 6, label: "alt-6", url: img6 });
    if (img7) gallery.push({ sort: 7, label: "alt-7", url: img7 });
    if (img8) gallery.push({ sort: 8, label: "alt-8", url: img8 });
    if (img9) gallery.push({ sort: 9, label: "alt-9", url: img9 });
    if (img10) gallery.push({ sort: 10, label: "alt-10", url: img10 });
    if (img11) gallery.push({ sort: 11, label: "alt-11", url: img11 });
    if (img12) gallery.push({ sort: 12, label: "alt-12", url: img12 });

    // Optional product
    const alsoCreateProduct = b(formData.get("also_create_product"));

    // server-enforced
    const submittedGame = sNull(formData.get("product_game"));
    const submittedFormat = sNull(formData.get("product_format"));
    if ((submittedGame && submittedGame !== "collectibles") || (submittedFormat && submittedFormat !== "single")) {
      redirect(
        `${backTo}?error=${encodeURIComponent(
          `Invalid product_game/product_format submitted. Collectibles must be game=collectibles format=single.`,
        )}`,
      );
    }

    const productGame: "collectibles" = "collectibles";
    const productFormat: "single" = "single";

    const productSkuOverride = sNull(formData.get("product_sku"));
    const productStatus = sNull(formData.get("product_status")) ?? "draft";
    const productInventoryType = sNull(formData.get("product_inventory_type")) ?? "stock";

    const productPriceCents = moneyToCentsOrZero(formData.get("product_price_cents"));
    const productCompareAtCents = (() => {
      const raw = s(formData.get("product_compare_at_cents"));
      if (!raw) return null;
      return moneyToCentsOrZero(formData.get("product_compare_at_cents"));
    })();

    const productQuantity = intNull(formData.get("product_quantity")) ?? 1;
    const productSubtitle = sNull(formData.get("product_subtitle"));
    const productShippingClass = sNull(formData.get("product_shipping_class"));

    const shippingWeightLbs =
      typeof extra?.weight_lb === "number" && Number.isFinite(extra.weight_lb)
        ? Math.max(0, Math.round(extra.weight_lb * 100) / 100)
        : null;

    const extraTagsRaw: string[] =
      extra && typeof extra === "object" && Array.isArray((extra as any).tags)
        ? (extra as any).tags.map((x: any) => String(x ?? "").trim()).filter(Boolean)
        : [];
    const extraTags = uniqueStringsCaseInsensitive(extraTagsRaw);

    const result = await db.transaction(async (tx) => {
      // 1) Upsert collectibles_items
      await tx.execute(sql`
        INSERT INTO public.collectibles_items (
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
          ${extra}::jsonb
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

      // 2) Resync collectibles_item_images deterministically
      await tx.execute(sql`
        DELETE FROM public.collectibles_item_images
        WHERE item_id = ${id}
      `);

      for (const g of gallery) {
        await tx.execute(sql`
          INSERT INTO public.collectibles_item_images (item_id, sort_order, label, url)
          VALUES (${id}, ${g.sort}, ${g.label}, ${g.url})
          ON CONFLICT (item_id, sort_order) DO UPDATE SET
            label = EXCLUDED.label,
            url = EXCLUDED.url,
            updated_at = now()
        `);
      }

      if (!alsoCreateProduct) {
        return { productId: null as string | null };
      }

      // 3) Upsert product
      const baseTitle = name ?? `Collectible ${id}`;

      const numPart =
        (typeof extra?.model_number === "string" && extra.model_number.trim()) ||
        number ||
        (upc ? upc.slice(-6) : id.split(":").pop() || "item");

      const baseSlug = `collectibles-${slugify(baseTitle)}-${slugify(numPart)}`.replace(/-+/g, "-");
      const productSlug = baseSlug || `collectibles-${slugify(id)}`;

      const skuCandidate = productSkuOverride || sourceId || id;

      const skuOkRows = await tx.execute<{ ok: boolean }>(sql`
        SELECT NOT EXISTS(
          SELECT 1 FROM public.products p
          WHERE p.sku = ${skuCandidate}
            AND (p.collectibles_item_id IS DISTINCT FROM ${id})
        ) AS ok
      `);
      const skuOk = Boolean((skuOkRows as any)?.rows?.[0]?.ok);
      const finalSku = skuOk ? skuCandidate : null;

      const upsertProductRows = await tx.execute<{ id: string }>(sql`
        INSERT INTO public.products (
          title,
          slug,
          game,
          format,
          sealed,
          is_graded,
          price_cents,
          compare_at_cents,
          inventory_type,
          quantity,
          status,
          subtitle,
          description,
          sku,
          shipping_weight_lbs,
          shipping_class,
          collectibles_item_id,
          source_card_id,
          created_at,
          updated_at
        )
        VALUES (
          ${baseTitle},
          ${productSlug},
          ${productGame}::game,
          ${productFormat}::product_format,
          ${false},
          ${false},
          ${productPriceCents},
          ${productCompareAtCents},
          ${productInventoryType}::inventory_type,
          ${productQuantity},
          ${productStatus}::product_status,
          ${productSubtitle},
          ${description},
          ${finalSku},
          ${shippingWeightLbs},
          ${productShippingClass},
          ${id},
          ${id},
          now(),
          now()
        )
        ON CONFLICT (slug) DO UPDATE SET
          title = EXCLUDED.title,
          game = ${productGame}::game,
          format = ${productFormat}::product_format,
          sealed = false,
          is_graded = false,
          price_cents = EXCLUDED.price_cents,
          compare_at_cents = COALESCE(EXCLUDED.compare_at_cents, public.products.compare_at_cents),
          inventory_type = EXCLUDED.inventory_type,
          quantity = EXCLUDED.quantity,
          status = EXCLUDED.status,
          subtitle = EXCLUDED.subtitle,
          description = EXCLUDED.description,
          sku = COALESCE(EXCLUDED.sku, public.products.sku),
          shipping_weight_lbs = EXCLUDED.shipping_weight_lbs,
          shipping_class = EXCLUDED.shipping_class,
          collectibles_item_id = EXCLUDED.collectibles_item_id,
          source_card_id = EXCLUDED.source_card_id,
          updated_at = now()
        RETURNING id::text AS id
      `);

      const productId = (upsertProductRows as any)?.rows?.[0]?.id as string | undefined;
      if (!productId) throw new Error("Failed to create/update products row.");

      // 4) Resync product_images from collectibles_item_images
      await tx.execute(sql`
        DELETE FROM public.product_images
        WHERE product_id = ${productId}::uuid
      `);

      const imgs = await tx.execute<{ sort_order: number; label: string | null; url: string }>(sql`
        SELECT sort_order, label, url
        FROM public.collectibles_item_images
        WHERE item_id = ${id}
        ORDER BY sort_order ASC
      `);

      const rows =
        ((imgs as any)?.rows ?? []) as Array<{ sort_order: number; label: string | null; url: string }>;

      for (const im of rows) {
        const alt = `${baseTitle}${im.label ? ` (${im.label})` : ""}`;
        await tx.execute(sql`
          INSERT INTO public.product_images (product_id, url, alt, sort, is_stock)
          VALUES (${productId}::uuid, ${im.url}, ${alt}, ${im.sort_order}, false)
          ON CONFLICT (product_id, url) DO UPDATE SET
            alt = EXCLUDED.alt,
            sort = EXCLUDED.sort,
            is_stock = false,
            updated_at = now()
        `);
      }

      // 5) Sync tags
      if (extraTags.length) {
        const tagIds: string[] = [];
        for (const t of extraTags) {
          const tr = await upsertOneTag(tx, t);
          tagIds.push(tr.id);
        }

        await tx.execute(sql`
          DELETE FROM public.product_tags
          WHERE product_id = ${productId}::uuid
        `);

        for (const tagId of tagIds) {
          await tx.execute(sql`
            INSERT INTO public.product_tags (product_id, tag_id)
            VALUES (${productId}::uuid, ${tagId}::uuid)
            ON CONFLICT (product_id, tag_id) DO NOTHING
          `);
        }
      }

      return { productId };
    });

    const okMsg = result.productId ? "Saved + synced product listing." : "Saved.";
    redirect(`/categories/collectibles/items/${encodeURIComponent(id)}?ok=${encodeURIComponent(okMsg)}`);
  } catch (e: any) {
    if (isNextRedirect(e)) throw e;

    const msg =
      typeof e?.message === "string" && e.message.trim()
        ? e.message.trim()
        : "Failed to save Collectibles item.";

    redirect(`/admin/collectibles/new?error=${encodeURIComponent(msg)}`);
  }
}
