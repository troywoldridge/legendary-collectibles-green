"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type ProductImageRow = {
  id: string;
  url: string;
  alt: string | null;
  sort: number;
  isStock: boolean;
  createdAt: string;
};

function safeHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isKnownStockHost(host: string): boolean {
  // Known “stock/catalog” sources (from your next.config remotePatterns + common)
  const STOCK_HOSTS = new Set([
    "images.pokemontcg.io",
    "images.ygoprodeck.com",
    "c1.scryfall.com",
    "cards.scryfall.io",
    "assets.tcgdex.net",
  ]);

  if (STOCK_HOSTS.has(host)) return true;

  // allow future-proofing: treat subdomains of these as stock
  const STOCK_SUFFIXES = [
    ".pokemontcg.io",
    ".ygoprodeck.com",
    ".scryfall.com",
    ".tcgdex.net",
  ];

  return STOCK_SUFFIXES.some((suf) => host.endsWith(suf));
}

function isLikelyYourPhotoHost(host: string): boolean {
  // Your Cloudflare Images delivery host
  if (host === "imagedelivery.net") return true;

  // Add more if you use them later (e.g. your own CDN domain)
  return false;
}

function guessIsStockFromUrl(url: string): boolean | null {
  const host = safeHostname(url);
  if (!host) return null;

  if (isLikelyYourPhotoHost(host)) return false;
  if (isKnownStockHost(host)) return true;

  // unknown host → no opinion
  return null;
}


export default function NewProductClient() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  const [sku, setSku] = useState<string>("");

  const [game, setGame] = useState("pokemon");
  const [format, setFormat] = useState("single");
  const [status, setStatus] = useState("draft");

  const [sealed, setSealed] = useState(false);
  const [isGraded, setIsGraded] = useState(false);

  const [condition, setCondition] = useState<string>("nm");

  const [priceCents, setPriceCents] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);

  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const suggestedSlug = useMemo(() => slugify(title), [title]);

  // After create:
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  // Images step
  const [images, setImages] = useState<ProductImageRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
    const [stockUrl, setStockUrl] = useState("");
  const [stockAlt, setStockAlt] = useState("");
  const [stockIsStock, setStockIsStock] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);


  async function create({ goToAi }: { goToAi: boolean }) {
    setLoading(true);
    setErr(null);

    try {
      const payload = {
        title: title.trim(),
        slug: (slug.trim() || suggestedSlug).trim(),
        sku: sku.trim() || null,
        game,
        format,
        status,
        sealed,
        isGraded,
        condition: isGraded ? null : condition || null,
        priceCents: Number.isFinite(priceCents) ? priceCents : 0,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        subtitle: subtitle.trim() || null,
        description: description.trim() || null,
      };

      const r = await fetch("/api/admin/products/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json();
      if (!j?.ok) throw new Error(j?.message || "Create failed");

      const productId = j?.product?.id as string | undefined;
      const productSlug = (j?.product?.slug as string | undefined) || payload.slug;

      if (!productId) throw new Error("Create succeeded but no product id returned");

      setCreatedId(productId);
      setCreatedSlug(productSlug);

      const ir = await fetch(`/api/admin/products/${productId}/images`, { cache: "no-store" });
      const ij = await ir.json();
      if (ij?.ok) setImages(ij.rows || []);

      if (goToAi) {
        router.push(`/admin/ai/listings?productId=${encodeURIComponent(productId)}&autogen=1`);
        return;
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshImages() {
    if (!createdId) return;
    const r = await fetch(`/api/admin/products/${createdId}/images`, { cache: "no-store" });
    const j = await r.json();
    if (j?.ok) setImages(j.rows || []);
  }

  async function attachImage(url: string, alt: string | null, isStock: boolean) {
    if (!createdId) return;

    const r = await fetch(`/api/admin/products/${createdId}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, alt, isStock }),
    });

    const j = await r.json();
    if (!j?.ok) throw new Error(j?.message || "Failed to attach image");

    setImages((prev) => [...prev, j.row]);
  }

    async function attachStockUrl() {
    if (!createdId) return;

    const url = stockUrl.trim();
    const alt = stockAlt.trim() || null;

    if (!url) {
      setImgErr("Paste an image URL first.");
      return;
    }

    setStockLoading(true);
    setImgErr(null);

    try {
      await attachImage(url, alt, stockIsStock);

      // reset inputs after success
      setStockUrl("");
      setStockAlt("");
      setStockIsStock(true);
    } catch (e: any) {
      setImgErr(String(e?.message ?? e));
    } finally {
      setStockLoading(false);
    }
  }

  const stockDetect = useMemo(() => {
  const url = (stockUrl || "").trim();
  const host = safeHostname(url);

  if (!url) {
    return { host: null as string | null, label: null as string | null };
  }

  if (!host) {
    return { host: null, label: "Invalid URL" };
  }

  if (isLikelyYourPhotoHost(host)) {
    return { host, label: `Detected: Your photos (${host})` };
  }

  if (isKnownStockHost(host)) {
    return { host, label: `Detected: Stock/catalog source (${host})` };
  }

  return { host, label: `Detected: Unknown source (${host})` };
}, [stockUrl]);


  async function uploadFiles(files: FileList | null) {
    if (!createdId) return;
    if (!files || files.length === 0) return;

    setUploading(true);
    setImgErr(null);

    try {
      for (const file of Array.from(files)) {
        // 1) request CF direct upload URL
        const r1 = await fetch("/api/admin/images/direct-upload", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            metadata: {
              productId: createdId,
              filename: file.name,
              contentType: file.type || "application/octet-stream",
            },
          }),
        });

        const j1 = await r1.json();
        if (!j1?.ok) throw new Error(j1?.error || j1?.message || "Failed to get upload URL");

        const uploadURL = j1.uploadURL as string | undefined;
        if (!uploadURL) throw new Error("direct-upload did not return uploadURL");

        // 2) upload to CF
        const form = new FormData();
        form.append("file", file);

        const r2 = await fetch(uploadURL, { method: "POST", body: form });
        const j2 = await r2.json().catch(() => ({}));

        // 3) pick a delivery URL
        const deliveryUrl =
          j2?.result?.variants?.[0] ||
          j2?.result?.variant_urls?.[0] ||
          null;

        if (!deliveryUrl) {
          throw new Error("Upload succeeded but no delivery URL found (variants missing)");
        }

        // 4) attach to product
        await attachImage(deliveryUrl, title.trim() || null, false);
      }
    } catch (e: any) {
      setImgErr(String(e?.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  async function toggleStock(imageId: string, isStock: boolean) {
    if (!createdId) return;
    setImgErr(null);

    const r = await fetch(`/api/admin/products/${createdId}/images`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageId, isStock }),
    });

    const j = await r.json();
    if (!j?.ok) {
      setImgErr(j?.message || "Failed to update image");
      return;
    }

    setImages((prev) => prev.map((x) => (x.id === imageId ? j.row : x)));
  }

  async function deleteImage(imageId: string) {
    if (!createdId) return;
    setImgErr(null);

    const r = await fetch(`/api/admin/products/${createdId}/images`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageId }),
    });

    const j = await r.json();
    if (!j?.ok) {
      setImgErr(j?.message || "Failed to delete image");
      return;
    }

    setImages((prev) => prev.filter((x) => x.id !== imageId));
  }

  async function persistOrder(next: ProductImageRow[]) {
    if (!createdId) return;

    const order = next.map((x, idx) => ({ id: x.id, sort: idx }));
    const r = await fetch(`/api/admin/products/${createdId}/images`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order }),
    });

    const j = await r.json();
    if (!j?.ok) throw new Error(j?.message || "Failed to persist order");
  }

  function moveItem(list: ProductImageRow[], fromId: string, toId: string) {
    if (fromId === toId) return list;
    const fromIdx = list.findIndex((x) => x.id === fromId);
    const toIdx = list.findIndex((x) => x.id === toId);
    if (fromIdx < 0 || toIdx < 0) return list;

    const next = [...list];
    const [picked] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, picked);

    return next.map((x, i) => ({ ...x, sort: i }));
  }

  return (
    <div className="grid gap-6">
      {/* Step 1 */}
      <div className="rounded-lg border border-white/10 p-4">
        {err ? <p className="mb-3 text-sm text-red-300">{err}</p> : null}

        <div className="text-sm font-semibold">Step 1 — Create Product</div>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1">
            <span className="text-sm opacity-80">Title</span>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slug.trim()) setSlug(slugify(e.target.value));
              }}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
              placeholder="e.g. Pikachu (Base Set) - nm"
              disabled={!!createdId}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm opacity-80">Slug</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
              placeholder={suggestedSlug || "auto-from-title"}
              disabled={!!createdId}
            />
            <span className="text-xs opacity-60">Suggested: {suggestedSlug || "—"}</span>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm opacity-80">Game</span>
              <select
                value={game}
                onChange={(e) => setGame(e.target.value)}
                className="rounded-md bg-black/30 border border-white/10 px-3 py-2"
                disabled={!!createdId}
              >
                <option value="pokemon">pokemon</option>
                <option value="yugioh">yugioh</option>
                <option value="mtg">mtg</option>
                <option value="sports">sports</option>
                <option value="funko">funko</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-sm opacity-80">Format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="rounded-md bg-black/30 border border-white/10 px-3 py-2"
                disabled={!!createdId}
              >
                <option value="single">single</option>
                <option value="pack">pack</option>
                <option value="box">box</option>
                <option value="bundle">bundle</option>
                <option value="lot">lot</option>
                <option value="accessory">accessory</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm opacity-80">Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="rounded-md bg-black/30 border border-white/10 px-3 py-2"
                disabled={!!createdId}
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
            </label>

            <label className="grid gap-1">
              <span className="text-sm opacity-80">SKU (optional)</span>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
                placeholder="e.g. PKM-BS-001-PIKACHU"
                disabled={!!createdId}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2">
              <input type="checkbox" checked={sealed} onChange={(e) => setSealed(e.target.checked)} disabled={!!createdId} />
              <span className="text-sm">Sealed</span>
            </label>

            <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2">
              <input type="checkbox" checked={isGraded} onChange={(e) => setIsGraded(e.target.checked)} disabled={!!createdId} />
              <span className="text-sm">Graded</span>
            </label>
          </div>

          {!isGraded ? (
            <label className="grid gap-1">
              <span className="text-sm opacity-80">Condition</span>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="rounded-md bg-black/30 border border-white/10 px-3 py-2"
                disabled={!!createdId}
              >
                <option value="new_factory_sealed">New Factory Sealed</option>
                <option value="nm">nm</option>
                <option value="lp">lp</option>
                <option value="mp">mp</option>
                <option value="hp">hp</option>
                <option value="dmg">dmg</option>
              </select>
            </label>
          ) : (
            <p className="text-xs opacity-70">
              Raw condition is de-emphasized for graded items — you can fill grader/grade later if needed.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm opacity-80">Price (cents)</span>
              <input
                type="number"
                value={priceCents}
                onChange={(e) => setPriceCents(Number(e.target.value))}
                className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
                min={0}
                disabled={!!createdId}
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm opacity-80">Quantity</span>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
                min={0}
                disabled={!!createdId}
              />
            </label>
          </div>

          <label className="grid gap-1">
            <span className="text-sm opacity-80">Subtitle (optional)</span>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
              placeholder="e.g. Reverse Holo / 1st Edition / Variant"
              disabled={!!createdId}
            />
          </label>

          <label className="grid gap-1">
            <span className="text-sm opacity-80">Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[110px] rounded-md bg-black/30 border border-white/10 px-3 py-2"
              placeholder="Optional starting description (AI can overwrite/improve later)."
              disabled={!!createdId}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!createdId ? (
            <>
              <button onClick={() => create({ goToAi: false })} disabled={loading} className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5">
                {loading ? "Saving…" : "Create"}
              </button>
              <button onClick={() => create({ goToAi: true })} disabled={loading} className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5">
                {loading ? "Saving…" : "Create + Generate"}
              </button>
            </>
          ) : (
            <>
              <button onClick={refreshImages} className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5">
                Refresh Images
              </button>
              <a href={`/admin/ai/listings?productId=${encodeURIComponent(createdId)}&autogen=1`} className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5">
                Generate (AI)
              </a>
              {createdSlug ? (
                <a href={`/products/${createdSlug}`} target="_blank" rel="noreferrer" className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5">
                  View Product
                </a>
              ) : null}
            </>
          )}

          <a href="/admin/products" className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5">
            Back
          </a>
        </div>

        {createdId ? <p className="mt-3 text-xs opacity-70">Created product id: {createdId}</p> : null}
      </div>

      {/* Step 2 */}
      <div className="rounded-lg border border-white/10 p-4">
        <div className="text-sm font-semibold">Step 2 — Add Images</div>
        <p className="mt-2 text-sm opacity-80">Upload photos, or attach stock images. Mark stock so the AI stays conservative.</p>

        {!createdId ? (
          <p className="mt-3 text-sm opacity-70">Create a product first to enable uploads.</p>
        ) : (
          <>
            {imgErr ? <p className="mt-3 text-sm text-red-300">{imgErr}</p> : null}

            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <input type="file" multiple accept="image/*" disabled={uploading} onChange={(e) => uploadFiles(e.target.files)} className="text-sm" />
              {uploading ? <span className="text-sm opacity-70">Uploading…</span> : null}
            </div>

                        <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
              <div className="text-sm font-medium">Attach Stock URL</div>
              <p className="mt-1 text-xs opacity-70">
                Paste any image URL. Mark as stock so the AI stays conservative and doesn’t claim “exact item shown”.
              </p>

              <div className="mt-3 grid gap-2">
               <input
                    value={stockUrl}
                    onChange={(e) => {
                        const next = e.target.value;
                        setStockUrl(next);

                        const guess = guessIsStockFromUrl(next.trim());
                        if (guess !== null) {
                        setStockIsStock(guess);
                        }
                    }}
                    placeholder="https://…"
                    className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm"
                    />


                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    value={stockAlt}
                    onChange={(e) => setStockAlt(e.target.value)}
                    placeholder="Alt text (optional)"
                    className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2 text-sm"
                  />

                  <label className="flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={stockIsStock}
                      onChange={(e) => setStockIsStock(e.target.checked)}
                    />
                    Stock image
                  </label>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={attachStockUrl}
                    disabled={stockLoading || !stockUrl.trim()}
                    className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5 text-sm"
                  >
                    {stockLoading ? "Attaching…" : "Attach"}
                  </button>

                  <button
                    onClick={() => {
                      setStockUrl("");
                      setStockAlt("");
                      setStockIsStock(true);
                    }}
                    disabled={stockLoading}
                    className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5 text-sm"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {stockDetect.label ? (
  <div className="mt-2 text-xs">
    <span
      className={[
        "inline-flex items-center rounded-md border px-2 py-1",
        stockDetect.label.startsWith("Detected: Stock")
          ? "border-amber-400/30 bg-amber-400/10 text-amber-200"
          : stockDetect.label.startsWith("Detected: Your photos")
            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
            : stockDetect.label.startsWith("Invalid URL")
              ? "border-red-400/30 bg-red-400/10 text-red-200"
              : "border-white/10 bg-white/5 text-white/70",
      ].join(" ")}
    >
      {stockDetect.label}
    </span>
  </div>
) : null}



            <div className="mt-4">
              {images.length ? (
                <div className="grid gap-3">
                  {images
                    .slice()
                    .sort((a, b) => a.sort - b.sort)
                    .map((img) => (
                      <div
                        key={img.id}
                        className="rounded-md border border-white/10 bg-black/20 p-3"
                        draggable
                        onDragStart={() => setDragId(img.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={async () => {
                          if (!dragId || dragId === img.id) return;
                          const next = moveItem(images, dragId, img.id);
                          setImages(next);
                          setDragId(null);
                          try {
                            await persistOrder(next);
                          } catch (e: any) {
                            setImgErr(String(e?.message ?? e));
                          }
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <a href={img.url} target="_blank" rel="noreferrer" className="block">
                              <div className="relative h-20 w-20 overflow-hidden rounded border border-white/10">
                                <Image src={img.url} alt={img.alt ?? ""} fill sizes="80px" className="object-cover" />
                              </div>
                            </a>

                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                Sort: {img.sort} {img.isStock ? "• STOCK" : "• PHOTO"}
                              </div>
                              <div className="text-xs opacity-70 truncate">{img.alt ?? "—"}</div>
                              <div className="text-xs opacity-60 truncate">{img.url}</div>
                              <div className="text-xs opacity-60 mt-1">Drag to reorder</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            <label className="flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={img.isStock} onChange={(e) => toggleStock(img.id, e.target.checked)} />
                              Stock
                            </label>

                            <button onClick={() => deleteImage(img.id)} className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5 text-sm">
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm opacity-70">No images attached yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
