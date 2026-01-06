// src/app/cart/CartClient.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import CheckoutButton from "./CheckoutButton";

type CartItem = {
  lineId: number;
  productId: string;
  slug: string | null;
  title: string | null;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  availableQty?: number | null;
  image?: { url: string; alt: string } | null;
};

type CartResponse = {
  cartId: string;
  items: CartItem[];
  subtotalCents: number;
  error?: string;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    (Number(cents) || 0) / 100
  );
}

async function safeJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) throw new Error(`Empty response (status ${res.status})`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON response (status ${res.status})`);
  }
}

async function removeLine(lineId: number) {
  const res = await fetch("/api/cart/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lineId }),
  });
  const data = await safeJson<any>(res);
  if (!res.ok) throw new Error(data?.error || "Failed to remove item");
}

async function clearCart() {
  const res = await fetch("/api/cart/clear", { method: "POST" });
  const data = await safeJson<any>(res);
  if (!res.ok) throw new Error(data?.error || "Failed to clear cart");
}

async function updateQty(lineId: number, qty: number) {
  const res = await fetch("/api/cart/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lineId, qty }),
  });
  const data = await safeJson<any>(res);
  if (!res.ok) throw new Error(data?.error || "Failed to update qty");
  return data as { ok: boolean; qty?: number; available?: number; clamped?: boolean; removed?: boolean };
}

export default function CartClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CartResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [busyLineId, setBusyLineId] = useState<number | null>(null);
  const [busyClear, setBusyClear] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/cart", { cache: "no-store" });
      const j = await safeJson<CartResponse>(res);

      if (!res.ok || j?.error) {
        setErr(j?.error || `Cart API error (${res.status})`);
        setData(null);
      } else {
        setData(j);
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to load cart");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const items = data?.items ?? [];
  const subtotal = data?.subtotalCents ?? 0;

  const disabledCheckout = useMemo(() => loading || items.length === 0, [loading, items.length]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">Your Cart</h1>

        {!loading && !err && items.length > 0 && (
          <button
            type="button"
            disabled={busyClear}
            onClick={async () => {
              if (busyClear) return;
              const ok = confirm("Clear all items from your cart?");
              if (!ok) return;

              setBusyClear(true);
              try {
                await clearCart();
                await load();
              } catch (e: any) {
                alert(e?.message || "Failed to clear cart");
              } finally {
                setBusyClear(false);
              }
            }}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-white/90 hover:bg-white/10 disabled:opacity-60"
          >
            {busyClear ? "Clearing…" : "Clear cart"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-6 rounded-lg border border-white/10 bg-black/30 p-6 text-white/80">
          Loading your cart…
        </div>
      ) : err ? (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-black/30 p-6">
          <div className="text-red-200 font-semibold">Cart couldn’t load</div>
          <div className="mt-2 text-sm text-white/80">{err}</div>
          <button
            onClick={() => void load()}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-lg border border-white/10 bg-black/30 p-6 text-white/80">
          Your cart is empty.
        </div>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            {items.map((it) => {
              const available = Number(it.availableQty ?? 0);
              const hasAvail = Number.isFinite(available) && available > 0;
              const atMax = hasAvail ? it.qty >= available : false;

              return (
                <div
                  key={it.lineId}
                  className="flex items-center gap-4 rounded-lg border border-white/10 bg-black/30 p-4"
                >
                  {/* Image */}
                  {it.image?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.image.url}
                      alt={it.image.alt || it.title || "Product image"}
                      className="h-16 w-16 shrink-0 rounded-md object-cover bg-white/5"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-16 w-16 shrink-0 rounded-md bg-white/5" />
                  )}

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{it.title ?? "Item"}</div>

                    {/* Qty controls */}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyLineId === it.lineId || it.qty <= 1}
                        onClick={async () => {
                          if (busyLineId) return;
                          setBusyLineId(it.lineId);
                          try {
                            await updateQty(it.lineId, it.qty - 1);
                            await load();
                          } catch (e: any) {
                            alert(e?.message || "Failed to update qty");
                          } finally {
                            setBusyLineId(null);
                          }
                        }}
                        className="h-8 w-8 rounded-lg border border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50"
                        aria-label="Decrease quantity"
                      >
                        –
                      </button>

                      <div className="min-w-[44px] text-center text-sm font-semibold">
                        {it.qty}
                      </div>

                      <button
                        type="button"
                        disabled={busyLineId === it.lineId || atMax}
                        onClick={async () => {
                          if (busyLineId) return;
                          setBusyLineId(it.lineId);
                          try {
                            await updateQty(it.lineId, it.qty + 1);
                            await load();
                          } catch (e: any) {
                            alert(e?.message || "Failed to update qty");
                          } finally {
                            setBusyLineId(null);
                          }
                        }}
                        className="h-8 w-8 rounded-lg border border-white/15 bg-white/5 text-white hover:bg-white/10 disabled:opacity-50"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>

                      <div className="ml-2 text-sm text-white/70">
                        {money(it.unitPriceCents)}
                      </div>
                    </div>

                    {/* inventory hint */}
                    {hasAvail && available <= 3 && (
                      <div className="mt-1 text-xs text-amber-200/90">
                        Only {available} left
                      </div>
                    )}

                    {/* Remove button */}
                    <button
                      type="button"
                      disabled={busyLineId === it.lineId}
                      onClick={async () => {
                        if (busyLineId) return;
                        setBusyLineId(it.lineId);
                        try {
                          await removeLine(it.lineId);
                          await load();
                        } catch (e: any) {
                          alert(e?.message || "Failed to remove item");
                        } finally {
                          setBusyLineId(null);
                        }
                      }}
                      className="mt-2 text-xs font-semibold text-red-300 hover:text-red-200 disabled:opacity-60"
                    >
                      {busyLineId === it.lineId ? "Working…" : "Remove"}
                    </button>
                  </div>

                  {/* Line total */}
                  <div className="text-right font-semibold">{money(it.lineTotalCents)}</div>
                </div>
              );
            })}
          </div>

          <aside className="h-fit rounded-lg border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between text-sm text-white/80">
              <span>Subtotal</span>
              <span className="font-semibold">{money(subtotal)}</span>
            </div>

            <CheckoutButton disabled={disabledCheckout} />
          </aside>
        </div>
      )}
    </main>
  );
}
