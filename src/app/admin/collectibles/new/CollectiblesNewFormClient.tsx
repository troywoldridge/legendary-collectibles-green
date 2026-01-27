/* eslint-disable @typescript-eslint/no-unused-vars */
// src/app/admin/collectibles/new/CollectiblesNewFormClient.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";

/* ---------------- helpers ---------------- */
function slugKey(input: string | null | undefined): string | null {
  const t = String(input ?? "").trim();
  if (!t) return null;
  return t
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const TAG_FIX: Record<string, string> = {
  horrer: "Horror",
  "horrer collectibles": "Horror Collectibles",
  "horror collectiblesn": "Horror Collectibles",
  "video game collectiblesn": "Video Game Collectibles",
  collectiblesn: "Collectibles",
};

function fixTag(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const low = t.toLowerCase();
  if (TAG_FIX[low]) return TAG_FIX[low];
  if (low === "animatronics") return "Animatronic";
  if (low === "animatronic") return "Animatronic";
  if (low === "fnaf") return "FNAF";
  if (/^[a-z0-9][a-z0-9\s!:'-]+$/i.test(t) && t === t.toLowerCase()) {
    return t.replace(/\b[a-z]/g, (m) => m.toUpperCase());
  }
  return t;
}

function parseTags(input: string): string[] {
  const arr = input
    .split(",")
    .map((s) => fixTag(s))
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const v of arr) {
    if (out.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === -1) out.push(v);
  }
  return out;
}

function safeParseJson(
  text: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return { ok: true, value: v as any };
    return { ok: false, error: "extra_json must be a JSON object (not an array/string)." };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Invalid JSON." };
  }
}

function toNumOrUndef(raw: string): number | undefined {
  const t = String(raw ?? "").trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 1000) / 1000;
}

/* ---------------- component ---------------- */
export default function CollectiblesNewFormClient({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  // Core fields used for extra JSON generation
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [franchise, setFranchise] = useState("");
  const [series, setSeries] = useState("");
  const [line, setLine] = useState("");
  const [number, setNumber] = useState("");
  const [sourceId, setSourceId] = useState("");

  // Specs saved into extra
  const [heightIn, setHeightIn] = useState("");
  const [weightLb, setWeightLb] = useState("");

  // Tags + Notes
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");

  // Shop listing (optional)
  const [alsoCreateProduct, setAlsoCreateProduct] = useState(false);
  const [productSku, setProductSku] = useState(""); // optional override

  // 🔒 Hard-lock these for the Collectibles admin form (server enforces too)
  const productGame = "collectibles";
  const productFormat = "single";

  const [productStatus, setProductStatus] = useState("draft");
  const [productInventoryType, setProductInventoryType] = useState("stock");
  const [productPriceCents, setProductPriceCents] = useState("");
  const [productCompareAtCents, setProductCompareAtCents] = useState("");
  const [productQuantity, setProductQuantity] = useState("1");
  const [productSubtitle, setProductSubtitle] = useState("");
  const [productShippingClass, setProductShippingClass] = useState("");

  // Manual override for JSON
  const [manual, setManual] = useState(false);
  const [extraText, setExtraText] = useState("{}");
  const [jsonError, setJsonError] = useState<string>("");

  const tagsUser = useMemo(() => parseTags(tagsText), [tagsText]);

  const generatedExtra = useMemo(() => {
    const brandClean = brand.trim() ? brand.trim() : undefined;
    const license = franchise.trim() ? franchise.trim() : undefined;
    const lineClean = line.trim() ? line.trim() : undefined;
    const seriesClean = series.trim() ? series.trim() : undefined;

    const modelNumber = number.trim() ? number.trim() : undefined;
    const supplierProductId = sourceId.trim() ? sourceId.trim() : undefined;

    const franchiseKey = slugKey(franchise) ?? undefined;
    const seriesKey = slugKey(series) ?? undefined;
    const lineKey = slugKey(line) ?? undefined;
    const brandKey = slugKey(brand) ?? undefined;

    const height_in = toNumOrUndef(heightIn);
    const weight_lb = toNumOrUndef(weightLb);

    const baseTags: string[] = [];
    if (brandClean) baseTags.push(brandClean);
    if (license) baseTags.push(license);
    if (seriesClean) baseTags.push(seriesClean);
    if (lineClean) baseTags.push(lineClean);

    const merged = [...baseTags, ...tagsUser]
      .map((t) => fixTag(t))
      .map((t) => t.trim())
      .filter(Boolean);

    const tags: string[] = [];
    for (const t of merged) {
      if (tags.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === -1) tags.push(t);
    }

    const searchAliases = [
      ...(brandClean ? [brandClean] : []),
      ...(license ? [license] : []),
      ...(seriesClean ? [seriesClean] : []),
      ...(lineClean ? [lineClean] : []),
      ...tags.filter((t) => t.length <= 30),
    ]
      .map((t) => t.trim())
      .filter(Boolean);

    const search_aliases: string[] = [];
    for (const t of searchAliases) {
      if (search_aliases.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === -1) {
        search_aliases.push(t);
      }
    }

    return {
      brand: brandClean,
      license,
      category: ["Anime Collectibles", "Figures"],

      franchise: license,
      series: seriesClean,
      line: lineClean,

      height_in,
      weight_lb,

      model_number: modelNumber,
      supplier_product_id: supplierProductId,

      brand_key: brandKey,
      franchise_key: franchiseKey,
      series_key: seriesKey,
      line_key: lineKey,

      tags,
      search_aliases,

      notes: notes?.trim() ? notes.trim() : undefined,
    };
  }, [brand, franchise, series, line, number, sourceId, heightIn, weightLb, tagsUser, notes]);

  useEffect(() => {
    if (manual) return;
    setExtraText(JSON.stringify(generatedExtra, null, 2));
    setJsonError("");
  }, [generatedExtra, manual]);

  useEffect(() => {
    if (!manual) return;
    const p = safeParseJson(extraText);
    setJsonError(p.ok ? "" : p.error);
  }, [extraText, manual]);

  // Small UX: sensible shipping class default
  useEffect(() => {
    if (!alsoCreateProduct) return;
    if (!productShippingClass.trim()) setProductShippingClass("collectible-figure");
  }, [alsoCreateProduct]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={action} className="space-y-6">
      {/* Core identifiers */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">Core identifiers</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            name="id"
            label="Canonical ID (optional)"
            placeholder="Banpresto4983164190458"
            help="If blank, we’ll auto-generate from Brand + UPC (e.g. banpresto:4983164190458)."
          />
          <Field name="upc" label="UPC (recommended)" placeholder="4983164190458" />

          <Field name="source" label="Source" placeholder="manual" />
          <Field
            name="source_id"
            label="Source ID"
            placeholder="BPST90458"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
          />
        </div>
      </div>

      {/* Catalog fields */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">Catalog fields</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            name="name"
            label="Name"
            placeholder="Banpresto Jujutsu Kaisen Panda Q Posket Petit Vol.2 Figure"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Field
            name="brand"
            label="Brand"
            placeholder="Banpresto"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
          <Field
            name="franchise"
            label="Franchise"
            placeholder="Jujutsu Kaisen"
            value={franchise}
            onChange={(e) => setFranchise(e.target.value)}
          />
          <Field
            name="series"
            label="Series"
            placeholder="Q Posket Petit Vol.2"
            value={series}
            onChange={(e) => setSeries(e.target.value)}
          />
          <Field
            name="line"
            label="Line"
            placeholder="(optional)"
            value={line}
            onChange={(e) => setLine(e.target.value)}
          />
          <Field
            name="number"
            label="Model / Number"
            placeholder="19045"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <Field name="edition" label="Edition" placeholder="(optional)" />
          <Field name="variant" label="Variant (text)" placeholder="(optional)" />
          <Field name="exclusivity" label="Exclusivity (text)" placeholder="(optional)" />
          <Field name="release_year" label="Release Year" placeholder="2023" />

          {/* Specs stored into extra */}
          <Field
            name="height_in"
            label="Height (inches) (extra)"
            placeholder="2.8"
            value={heightIn}
            onChange={(e) => setHeightIn(e.target.value)}
            help="Stored in extra.height_in (number)."
          />
          <Field
            name="weight_lb"
            label="Weight (lb) (extra)"
            placeholder="0.14"
            value={weightLb}
            onChange={(e) => setWeightLb(e.target.value)}
            help="Stored in extra.weight_lb (number)."
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Toggle name="is_chase" label="Is Chase?" />
          <Toggle name="is_exclusive" label="Is Exclusive?" />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            name="image_small"
            label="Image (small) (legacy)"
            placeholder="https://imagedelivery.net/.../productTile"
          />
          <Field
            name="image_large"
            label="Image (large) (legacy)"
            placeholder="https://imagedelivery.net/.../productTile"
          />
        </div>

        <div className="mt-4">
          <TextArea
            name="description"
            label="Description"
            placeholder="Collector-safe description, no hype/guarantees…"
          />
        </div>
      </div>

      {/* Gallery images */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">Gallery (main + up to 12)</h2>
        <p className="mt-1 text-sm text-white/70">
          Saves to <code>public.collectibles_item_images</code>. Main image is <code>sort_order = 0</code> with{" "}
          <code>label = main</code>.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field name="img_main" label="Main image (sort 0)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_1" label="Alt 1 (sort 1)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_2" label="Alt 2 (sort 2)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_3" label="Alt 3 (sort 3)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_4" label="Alt 4 (sort 4)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_5" label="Alt 5 (sort 5)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_6" label="Alt 6 (sort 6)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_7" label="Alt 7 (sort 7)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_8" label="Alt 8 (sort 8)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_9" label="Alt 9 (sort 9)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_10" label="Alt 10 (sort 10)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_11" label="Alt 11 (sort 11)" placeholder="https://imagedelivery.net/.../productTile" />
          <Field name="img_12" label="Alt 12 (sort 12)" placeholder="https://imagedelivery.net/.../productTile" />
        </div>
      </div>

      {/* Shop Listing */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">Shop Listing (optional)</h2>
        <p className="mt-1 text-sm text-white/70">
          If enabled, this will also create/update <code>products</code>, resync <code>product_images</code> from the
          collectibles gallery, and sync tags into <code>tags</code> + <code>product_tags</code>.
        </p>

        <div className="mt-4">
          <label className="flex items-center gap-3 rounded-xl border border-white/15 bg-black/20 p-3">
            <input
              type="checkbox"
              name="also_create_product"
              checked={alsoCreateProduct}
              onChange={(e) => setAlsoCreateProduct(e.target.checked)}
              className="h-4 w-4"
            />
            <div className="text-sm text-white">Also create/update a Product listing</div>
          </label>
        </div>

        {/* Hidden hard-locked values */}
        <input type="hidden" name="product_game" value={productGame} />
        <input type="hidden" name="product_format" value={productFormat} />

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            name="product_sku"
            label="Product SKU (optional override)"
            placeholder="BPST90458"
            value={productSku}
            onChange={(e) => setProductSku(e.target.value)}
            help="Leave blank to default to Source ID (or brand:<upc>)."
          />

          <ReadOnlyField label="Product Game" value="collectibles" help="Hard-locked for Collectibles listings." />
          <ReadOnlyField label="Product Format" value="single" help="Hard-locked for Collectibles listings." />

          <Field
            name="product_status"
            label="Status"
            placeholder="draft"
            value={productStatus}
            onChange={(e) => setProductStatus(e.target.value)}
            help="Example: draft or active"
          />
          <Field
            name="product_inventory_type"
            label="Inventory Type"
            placeholder="stock"
            value={productInventoryType}
            onChange={(e) => setProductInventoryType(e.target.value)}
          />

          <Field
            name="product_price_cents"
            label="Price (cents)"
            placeholder="1499"
            value={productPriceCents}
            onChange={(e) => setProductPriceCents(e.target.value)}
            help="Accepts 14.99 or 1499"
          />
          <Field
            name="product_compare_at_cents"
            label="Compare at (cents) (optional)"
            placeholder="1999"
            value={productCompareAtCents}
            onChange={(e) => setProductCompareAtCents(e.target.value)}
          />

          <Field
            name="product_quantity"
            label="Quantity"
            placeholder="1"
            value={productQuantity}
            onChange={(e) => setProductQuantity(e.target.value)}
          />
          <Field
            name="product_subtitle"
            label="Subtitle (optional)"
            placeholder="Anime figure / Japan import / etc"
            value={productSubtitle}
            onChange={(e) => setProductSubtitle(e.target.value)}
          />

          <Field
            name="product_shipping_class"
            label="Shipping class (optional)"
            placeholder="collectible-figure"
            value={productShippingClass}
            onChange={(e) => setProductShippingClass(e.target.value)}
          />
        </div>

        <div className="mt-2 text-xs text-white/60">
          The product will be linked via <code>products.collectibles_item_id = collectibles_items.id</code>. Images are
          resynced into <code>product_images</code>. Tags sync into <code>tags</code> + <code>product_tags</code>.
        </div>
      </div>

      {/* Tags + Extra JSON */}
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <h2 className="text-lg font-semibold text-white">Tags + Extra JSON</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className="text-xs uppercase tracking-wide text-white/60">Tags (comma separated)</div>
            <input
              name="tags_text"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="Banpresto, Jujutsu Kaisen, Q Posket, Anime Figure"
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
          </label>

          <label className="block">
            <div className="text-xs uppercase tracking-wide text-white/60">Notes (optional)</div>
            <input
              name="extra_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes…"
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-white/60">
            JSON below is stored in <code>collectibles_items.extra</code>.
          </div>

          <label className="flex items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              name="extra_manual"
              checked={manual}
              onChange={(e) => setManual(e.target.checked)}
              className="h-4 w-4"
            />
            Edit manually
          </label>
        </div>

        {jsonError ? (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
            {jsonError}
          </div>
        ) : null}

        <div className="mt-3">
          <div className="text-xs uppercase tracking-wide text-white/60">extra (JSON)</div>
          <textarea
            name="extra_json"
            value={extraText}
            onChange={(e) => setExtraText(e.target.value)}
            readOnly={!manual}
            rows={12}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 font-mono text-xs text-white placeholder:text-white/40"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
        >
          Save Collectibles Item
        </button>

        <Link href="/categories/collectibles/items" className="text-sky-300 hover:underline">
          Cancel
        </Link>
      </div>

      <div className="text-xs text-white/60">
        After saving, visit:{" "}
        <code className="break-all">/categories/collectibles/items/&lt;id&gt;</code>
      </div>
    </form>
  );
}

/* ---------------- UI atoms ---------------- */
function Field({
  name,
  label,
  placeholder,
  help,
  value,
  onChange,
}: {
  name: string;
  label: string;
  placeholder?: string;
  help?: string;
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const controlled = typeof value === "string" && typeof onChange === "function";

  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <input
        name={name}
        placeholder={placeholder}
        {...(controlled ? { value, onChange } : {})}
        className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
      {help ? <div className="mt-2 text-xs text-white/50">{help}</div> : null}
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  return (
    <div className="block">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="mt-2 w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90">
        {value}
      </div>
      {help ? <div className="mt-2 text-xs text-white/50">{help}</div> : null}
    </div>
  );
}

function TextArea({
  name,
  label,
  placeholder,
  rows = 6,
}: {
  name: string;
  label: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <textarea
        name={name}
        placeholder={placeholder}
        rows={rows}
        className="mt-2 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
      />
    </label>
  );
}

function Toggle({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-white/15 bg-black/20 p-3">
      <input type="checkbox" name={name} className="h-4 w-4" />
      <div className="text-sm text-white">{label}</div>
    </label>
  );
}
