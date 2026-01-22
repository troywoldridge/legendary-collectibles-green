"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";

function slugify(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type ImgRow = { url: string; alt: string };

export default function NewProductClient() {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);

  const [sku, setSku] = useState("");

  const [game, setGame] = useState("pokemon");
  const [format, setFormat] = useState("single");
  const [status, setStatus] = useState("draft");

  const [sealed, setSealed] = useState(false);
  const [isGraded, setIsGraded] = useState(false);

  const [condition, setCondition] = useState("");
  const [grader, setGrader] = useState("");
  const [gradeX10, setGradeX10] = useState<string>("");

  const [price, setPrice] = useState("0.00");
  const [quantity, setQuantity] = useState<number>(1);

  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");

  const [imagesText, setImagesText] = useState(""); // one URL per line
  const imagesPreview = useMemo(() => {
    return imagesText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((url) => ({ url, alt: "" } satisfies ImgRow));
  }, [imagesText]);

  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState<{ productId: string; slug: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onTitleChange(v: string) {
    setTitle(v);
    if (autoSlug) setSlug(slugify(v));
  }

  async function submit() {
    setSaving(true);
    setErr(null);
    setOk(null);

    try {
      const body: any = {
        title: title.trim(),
        slug: slug.trim(),
        sku: sku.trim() || null,

        game,
        format,
        status,

        sealed,
        isGraded,

        condition: condition || null,
        grader: grader || null,
        gradeX10: gradeX10.trim() ? Number(gradeX10.trim()) : null,

        price,
        quantity,

        subtitle: subtitle.trim() || null,
        description: description.trim() || null,

        images: imagesPreview,
      };

      const r = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.message || "Create failed");

      setOk({ productId: j.productId, slug: j.slug });
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-white/10 p-4">
      {err ? <p className="text-sm text-red-300 mb-3">{err}</p> : null}
      {ok ? (
        <div className="mb-4 rounded-md border border-white/10 bg-black/30 p-3">
          <div className="text-sm font-semibold">Created ✅</div>
          <div className="text-sm opacity-80 mt-1">Product ID: {ok.productId}</div>
          <div className="text-sm mt-2 flex flex-wrap gap-2">
            <a className="underline hover:opacity-80" href={`/products/${ok.slug}`} target="_blank" rel="noreferrer">
              View product page
            </a>
            <a className="underline hover:opacity-80" href={`/admin/ai/listings`} target="_blank" rel="noreferrer">
              Go to AI Listings
            </a>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4">
        <div>
          <label className="text-sm opacity-80">Title *</label>
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
            placeholder="e.g., Misty’s Starmie (DRI-047) — nm"
          />
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 220px" }}>
          <div>
            <label className="text-sm opacity-80">Slug *</label>
            <input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setAutoSlug(false);
              }}
              className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
              placeholder="mistys-starmie-dri-047"
            />
            <div className="mt-2 text-xs opacity-70 flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoSlug}
                onChange={(e) => {
                  const v = e.target.checked;
                  setAutoSlug(v);
                  if (v) setSlug(slugify(title));
                }}
              />
              Auto-generate slug from title
            </div>
          </div>

          <div>
            <label className="text-sm opacity-80">SKU</label>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
              placeholder="PKM-ABC-123"
            />
          </div>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>
            <label className="text-sm opacity-80">Game *</label>
            <select
              value={game}
              onChange={(e) => setGame(e.target.value)}
              className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
            >
              <option value="pokemon">pokemon</option>
              <option value="yugioh">yugioh</option>
              <option value="mtg">mtg</option>
              <option value="funko">funko</option>
            </select>
          </div>

          <div>
            <label className="text-sm opacity-80">Format *</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
            >
              <option value="single">single</option>
              <option value="sealed">sealed</option>
              <option value="lot">lot</option>
            </select>
          </div>

          <div>
            <label className="text-sm opacity-80">Status *</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="flex items-center gap-2 text-sm opacity-80">
            <input type="checkbox" checked={sealed} onChange={(e) => setSealed(e.target.checked)} />
            Sealed
          </label>

          <label className="flex items-center gap-2 text-sm opacity-80">
            <input type="checkbox" checked={isGraded} onChange={(e) => setIsGraded(e.target.checked)} />
            Graded (slab)
          </label>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>
            <label className="text-sm opacity-80">Condition (nm/lp/mp/hp/dmg)</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
            >
              <option value="new_factory_sealed">New Factory Sealed</option>  
              <option value="">—</option>
              <option value="nm">nm</option>
              <option value="lp">lp</option>
              <option value="mp">mp</option>
              <option value="hp">hp</option>
              <option value="dmg">dmg</option>
            </select>
          </div>

          <div>
            <label className="text-sm opacity-80">Grader (psa/bgs/cgc)</label>
            <select
              value={grader}
              onChange={(e) => setGrader(e.target.value)}
              className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
            >
              <option value="">—</option>
              <option value="psa">psa</option>
              <option value="bgs">bgs</option>
              <option value="cgc">cgc</option>
            </select>
          </div>

          <div>
            <label className="text-sm opacity-80">Grade X10 (integer)</label>
            <input
              value={gradeX10}
              onChange={(e) => setGradeX10(e.target.value)}
              className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
              placeholder="10"
            />
          </div>
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label className="text-sm opacity-80">Price (USD) *</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
              placeholder="3.00"
            />
          </div>

          <div>
            <label className="text-sm opacity-80">Quantity</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
              min={0}
            />
          </div>
        </div>

        <div>
          <label className="text-sm opacity-80">Subtitle</label>
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
            placeholder="e.g., Reverse Holo"
          />
        </div>

        <div>
          <label className="text-sm opacity-80">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
            rows={6}
            placeholder="Optional. AI can generate later."
          />
        </div>

        <div>
          <label className="text-sm opacity-80">Image URLs (one per line)</label>
          <textarea
            value={imagesText}
            onChange={(e) => setImagesText(e.target.value)}
            className="mt-1 w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
            rows={4}
            placeholder="https://...\nhttps://..."
          />
          <p className="text-xs opacity-70 mt-2">
            These will be inserted into <code>product_images</code> with sort order top-to-bottom.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={saving}
            className="rounded-md border border-white/10 px-4 py-2 hover:bg-white/5"
          >
            {saving ? "Creating…" : "Create Product"}
          </button>
        </div>
      </div>
    </div>
  );
}
