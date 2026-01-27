/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ListType = "owned" | "wishlist" | "for_sale";

type FunkoCatalogItem = {
  id: string;
  name: string | null;
  franchise: string | null;
  series: string | null;
  line: string | null;
  number: string | null;
  edition: string | null;
  variant: string | null;
  isChase: boolean;
  isExclusive: boolean;
  exclusivity: string | null;
  releaseYear: number | null;
  upc: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  source: string | null;
  sourceId: string | null;
};

type CollectionRow = {
  collectionId: string;
  funkoItemId: string;
  listType: ListType;
  qty: number;

  purchasePriceCents: number | null;
  notes: string | null;

  // joined catalog fields
  name: string | null;
  franchise: string | null;
  series: string | null;
  line: string | null;
  number: string | null;
  edition: string | null;
  variant: string | null;
  isChase: boolean;
  isExclusive: boolean;
  exclusivity: string | null;
  releaseYear: number | null;
  upc: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  source: string | null;
  sourceId: string | null;
};

function cls(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function listLabel(t: ListType) {
  if (t === "owned") return "Owned";
  if (t === "wishlist") return "Wishlist";
  return "For Sale";
}

function safeJson<T>(v: any, fallback: T): T {
  return (v ?? fallback) as T;
}

async function jsonFetch(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export default function FunkoCollectionClient() {
  const [tab, setTab] = useState<ListType>("owned");

  // collection state
  const [collection, setCollection] = useState<CollectionRow[]>([]);
  const [collLoading, setCollLoading] = useState(false);
  const [collError, setCollError] = useState<string | null>(null);

  // search state
  const [q, setQ] = useState("");
  const [searchItems, setSearchItems] = useState<FunkoCatalogItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // keep a quick lookup of qty by funkoItemId for current tab
  const qtyById = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of collection) m.set(row.funkoItemId, Number(row.qty ?? 0));
    return m;
  }, [collection]);

  const inflight = useRef<{ coll?: AbortController; search?: AbortController }>({});

  async function loadCollection(activeTab: ListType) {
    setCollLoading(true);
    setCollError(null);

    try {
      inflight.current.coll?.abort();
      const ac = new AbortController();
      inflight.current.coll = ac;

      const data = await jsonFetch(
        `/api/collection/funko?list_type=${encodeURIComponent(activeTab)}&limit=200&offset=0`,
        { signal: ac.signal },
      );

      setCollection(safeJson(data?.items, []));
    } catch (e: any) {
      if (String(e?.name) === "AbortError") return;
      setCollError(e?.message || "Failed to load collection.");
    } finally {
      setCollLoading(false);
    }
  }

  async function runSearch(query: string) {
    const trimmed = query.trim();
    setSearchError(null);

    if (!trimmed) {
      setSearchItems([]);
      return;
    }

    setSearchLoading(true);

    try {
      inflight.current.search?.abort();
      const ac = new AbortController();
      inflight.current.search = ac;

      const data = await jsonFetch(
        `/api/funko/search?q=${encodeURIComponent(trimmed)}&limit=24&offset=0`,
        { signal: ac.signal },
      );

      setSearchItems(safeJson(data?.items, []));
    } catch (e: any) {
      if (String(e?.name) === "AbortError") return;
      setSearchError(e?.message || "Search failed.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function addOne(funkoItemId: string, listType: ListType) {
    // optimistic UI: bump qty immediately
    setCollection((prev) => {
      const idx = prev.findIndex((r) => r.funkoItemId === funkoItemId && r.listType === listType);
      if (idx === -1) return prev; // will refresh after success
      const copy = [...prev];
      copy[idx] = { ...copy[idx], qty: Number(copy[idx].qty ?? 0) + 1 };
      return copy;
    });

    await jsonFetch(`/api/collection/funko/add`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ funkoItemId, listType, qty: 1 }),
    });

    // keep things truthful (handles “first add” and server-side normalization)
    await loadCollection(listType);
  }

  async function removeOne(funkoItemId: string, listType: ListType) {
    // optimistic UI: decrement / remove row
    setCollection((prev) => {
      const idx = prev.findIndex((r) => r.funkoItemId === funkoItemId && r.listType === listType);
      if (idx === -1) return prev;
      const cur = Number(prev[idx].qty ?? 0);
      const next = cur - 1;
      const copy = [...prev];
      if (next <= 0) copy.splice(idx, 1);
      else copy[idx] = { ...copy[idx], qty: next };
      return copy;
    });

    await jsonFetch(`/api/collection/funko/remove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ funkoItemId, listType, qty: 1 }),
    });

    await loadCollection(listType);
  }

  // load collection when tab changes
  useEffect(() => {
    loadCollection(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Funko Collection</h1>
          <p className="text-sm opacity-70">
            Search the catalog, then add items to <strong>{listLabel(tab)}</strong>. Use +/− to adjust qty.
          </p>
        </div>

        <div className="w-full sm:w-[420px]">
          <label className="block text-sm opacity-70 mb-1">Search Funko catalog</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, series, number…"
            className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-white/30"
          />
          <div className="mt-1 text-xs opacity-60">
            {searchLoading ? "Searching…" : searchError ? `Search error: ${searchError}` : q.trim() ? `${searchItems.length} results` : " "}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-2">
        {(["owned", "wishlist", "for_sale"] as ListType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cls(
              "rounded-md px-3 py-2 text-sm border",
              tab === t ? "border-white/30 bg-white/10" : "border-white/10 bg-black/20 hover:border-white/20",
            )}
          >
            {listLabel(t)}
          </button>
        ))}
      </div>

      {/* Collection summary */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-sm opacity-80">
          {collLoading ? "Loading collection…" : collError ? `Collection error: ${collError}` : `${collection.length} items in ${listLabel(tab)}`}
        </div>
        <button
          onClick={() => loadCollection(tab)}
          className="text-sm rounded-md border border-white/10 bg-black/20 px-3 py-2 hover:border-white/20"
        >
          Refresh
        </button>
      </div>

      {/* Search Results */}
      {q.trim() ? (
        <section className="mt-5">
          <h2 className="text-lg font-medium mb-2">Search results</h2>

          {searchItems.length === 0 && !searchLoading ? (
            <div className="rounded-md border border-white/10 bg-black/20 p-4 text-sm opacity-80">
              No results. Try a different query.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {searchItems.map((it) => {
              const qty = qtyById.get(it.id) ?? 0;

              return (
                <div key={it.id} className="rounded-md border border-white/10 bg-black/20 p-3">
                  <div className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 rounded bg-white/5 overflow-hidden">
                      {it.imageLarge ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.imageLarge} alt={it.name ?? "Funko"} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-xs opacity-50">no image</div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{it.name ?? "Untitled"}</div>
                      <div className="text-xs opacity-70 truncate">
                        {it.series ? it.series : "—"}{it.number ? ` • #${it.number}` : ""}
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="text-xs opacity-80">
                          {qty > 0 ? (
                            <>
                              In your <strong>{listLabel(tab)}</strong>: <strong>Qty {qty}</strong>
                            </>
                          ) : (
                            <>Not in your {listLabel(tab).toLowerCase()} yet</>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => removeOne(it.id, tab)}
                            disabled={qty <= 0}
                            className={cls(
                              "h-8 w-8 rounded border text-sm",
                              qty <= 0 ? "border-white/5 opacity-40 cursor-not-allowed" : "border-white/15 hover:border-white/30",
                            )}
                            aria-label="Decrease quantity"
                            title="Decrease"
                          >
                            −
                          </button>
                          <button
                            onClick={() => addOne(it.id, tab)}
                            className="h-8 w-8 rounded border border-white/15 hover:border-white/30 text-sm"
                            aria-label="Increase quantity"
                            title="Increase"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Quick add-to-other-list shortcuts */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(["owned", "wishlist", "for_sale"] as ListType[])
                          .filter((t) => t !== tab)
                          .map((t) => (
                            <button
                              key={t}
                              onClick={() => addOne(it.id, t)}
                              className="rounded border border-white/10 bg-black/10 px-2 py-1 text-xs opacity-80 hover:border-white/20"
                              title={`Add 1 to ${listLabel(t)}`}
                            >
                              + {listLabel(t)}
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-[11px] opacity-60 break-all">
                    {it.id}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Current tab list */}
      <section className="mt-8">
        <h2 className="text-lg font-medium mb-2">{listLabel(tab)} items</h2>

        {collection.length === 0 && !collLoading ? (
          <div className="rounded-md border border-white/10 bg-black/20 p-4 text-sm opacity-80">
            Nothing here yet. Search above and hit <strong>+</strong> to add your first item.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {collection.map((row) => (
            <div key={row.collectionId} className="rounded-md border border-white/10 bg-black/20 p-3">
              <div className="flex gap-3">
                <div className="h-16 w-16 shrink-0 rounded bg-white/5 overflow-hidden">
                  {row.imageLarge ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.imageLarge} alt={row.name ?? "Funko"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs opacity-50">no image</div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{row.name ?? "Untitled"}</div>
                  <div className="text-xs opacity-70 truncate">
                    {row.series ? row.series : "—"}{row.number ? ` • #${row.number}` : ""}
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-sm">
                      Qty <strong>{row.qty}</strong>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => removeOne(row.funkoItemId, tab)}
                        className="h-8 w-8 rounded border border-white/15 hover:border-white/30 text-sm"
                        aria-label="Decrease quantity"
                        title="Decrease"
                      >
                        −
                      </button>
                      <button
                        onClick={() => addOne(row.funkoItemId, tab)}
                        className="h-8 w-8 rounded border border-white/15 hover:border-white/30 text-sm"
                        aria-label="Increase quantity"
                        title="Increase"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 text-[11px] opacity-60 break-all">
                    {row.funkoItemId}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
