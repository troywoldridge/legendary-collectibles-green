"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import CheckoutButton from "@/app/cart/CheckoutButton";


type CartItem = {
  lineId: number;
  productId: string;
  slug: string;
  title: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  compareAtCents?: number | null;
  sealed?: boolean;
  isGraded?: boolean;
  grader?: string | null;
  gradeX10?: number | null;
  condition?: string | null;
  inventoryType?: string | null;
  availableQty?: number | null;
  image?: { url: string; alt: string | null } | null;
};

type CartResponse = {
  cartId: string | null;
  items: CartItem[];
  subtotalCents: number;
};

const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format((cents || 0) / 100);

async function apiGetCart(): Promise<CartResponse> {
  const r = await fetch("/api/cart", { cache: "no-store" });
  if (!r.ok) throw new Error("Failed to load cart");
  return r.json();
}

async function apiUpdateLine(lineId: number, qty: number) {
  const r = await fetch("/api/cart/update", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lineId, qty }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "Failed to update cart");
  return j;
}

async function apiRemoveLine(lineId: number) {
  const r = await fetch("/api/cart/remove", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lineId }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "Failed to remove item");
  return j;
}

export default function CartClient() {
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartResponse>({ cartId: null, items: [], subtotalCents: 0 });
  const [busyLineIds, setBusyLineIds] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const hasItems = cart.items.length > 0;

  const subtotal = useMemo(() => cart.subtotalCents ?? 0, [cart.subtotalCents]);

  async function refresh() {
    setError(null);
    const data = await apiGetCart();
    setCart(data);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await refresh();
      } catch (e: any) {
        setError(e?.message || "Failed to load cart");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function setBusy(lineId: number, val: boolean) {
    setBusyLineIds((prev) => ({ ...prev, [lineId]: val }));
  }

  async function changeQty(lineId: number, nextQty: number) {
    try {
      setError(null);
      setBusy(lineId, true);

      // Optimistic UI
      setCart((prev) => {
        const items = prev.items.map((it) =>
          it.lineId === lineId
            ? {
                ...it,
                qty: nextQty,
                lineTotalCents: (it.unitPriceCents ?? 0) * nextQty,
              }
            : it
        );

        const subtotalCents = items.reduce((sum, it) => sum + (it.unitPriceCents ?? 0) * (it.qty ?? 0), 0);
        return { ...prev, items, subtotalCents };
      });

      if (nextQty <= 0) {
        await apiRemoveLine(lineId);
      } else {
        await apiUpdateLine(lineId, nextQty);
      }

      // Pull fresh totals/server truth
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to update cart");
      await refresh().catch(() => {});
    } finally {
      setBusy(lineId, false);
    }
  }

  async function removeLine(lineId: number) {
    try {
      setError(null);
      setBusy(lineId, true);

      // Optimistic remove
      setCart((prev) => {
        const items = prev.items.filter((it) => it.lineId !== lineId);
        const subtotalCents = items.reduce((sum, it) => sum + (it.unitPriceCents ?? 0) * (it.qty ?? 0), 0);
        return { ...prev, items, subtotalCents };
      });

      await apiRemoveLine(lineId);
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to remove item");
      await refresh().catch(() => {});
    } finally {
      setBusy(lineId, false);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Your Cart</h1>
            <p className="mt-1 text-white/80">
              Review your items and adjust quantities before checkout.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/store"
              className="rounded-lg border border-white/30 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Continue shopping
            </Link>

            <Link
              href="/"
              className="rounded-lg border border-white/30 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Home
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* Items */}
          <section className="rounded-2xl border border-white/15 bg-white/5 p-4 sm:p-5">
            {loading ? (
              <div className="space-y-4">
                <div className="h-6 w-48 rounded bg-white/10" />
                <div className="h-24 rounded-xl bg-white/10" />
                <div className="h-24 rounded-xl bg-white/10" />
              </div>
            ) : !hasItems ? (
              <div className="py-12 text-center">
                <div className="text-xl font-semibold text-white">Your cart is empty</div>
                <p className="mt-2 text-white/80">Go grab some heat 🔥</p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <Link
                    href="/store"
                    className="rounded-lg border border-white/40 bg-indigo-600/80 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
                  >
                    Shop the store
                  </Link>
                  <Link
                    href="/categories"
                    className="rounded-lg border border-white/30 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Browse categories
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="space-y-4">
                {cart.items.map((it) => {
                  const busy = !!busyLineIds[it.lineId];
                  const imgUrl = it.image?.url ?? null;

                  return (
                    <li
                      key={it.lineId}
                      className="overflow-hidden rounded-xl border border-white/15 bg-white/5"
                    >
                      <div className="flex gap-4 p-4">
                        {/* Image */}
                        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-white/5">
                          {imgUrl ? (
                            <Image
                              src={imgUrl}
                              alt={it.image?.alt ?? it.title}
                              fill
                              className="object-cover"
                              unoptimized
                              sizes="96px"
                            />
                          ) : (
                            <div className="h-full w-full bg-white/10" />
                          )}
                        </div>

                        {/* Details */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-base font-semibold text-white line-clamp-2">
                                {it.title}
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/75">
                                {it.sealed ? <span className="rounded border border-white/20 bg-white/10 px-2 py-0.5">Sealed</span> : null}
                                {it.isGraded ? (
                                  <span className="rounded border border-white/20 bg-white/10 px-2 py-0.5">
                                    Graded{it.grader ? ` • ${it.grader}` : ""}{it.gradeX10 ? ` • ${it.gradeX10}/10` : ""}
                                  </span>
                                ) : null}
                                {it.condition ? (
                                  <span className="rounded border border-white/20 bg-white/10 px-2 py-0.5">
                                    {String(it.condition).toUpperCase()}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-sm font-semibold text-white">{fmtUSD(it.unitPriceCents)}</div>
                              {it.compareAtCents ? (
                                <div className="text-xs text-white/60 line-through">{fmtUSD(it.compareAtCents)}</div>
                              ) : null}
                            </div>
                          </div>

                          {/* Controls */}
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={busy || it.qty <= 1}
                                onClick={() => changeQty(it.lineId, Math.max(1, it.qty - 1))}
                                className="h-9 w-9 rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/15 disabled:opacity-50"
                                aria-label="Decrease quantity"
                              >
                                −
                              </button>

                              <div className="h-9 min-w-[56px] rounded-lg border border-white/20 bg-white/5 px-3 flex items-center justify-center text-sm font-semibold text-white">
                                {it.qty}
                              </div>

                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => changeQty(it.lineId, it.qty + 1)}
                                className="h-9 w-9 rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/15 disabled:opacity-50"
                                aria-label="Increase quantity"
                              >
                                +
                              </button>

                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => removeLine(it.lineId)}
                                className="ml-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>

                            <div className="text-right">
                              <div className="text-xs text-white/70">Line total</div>
                              <div className="text-sm font-semibold text-white">
                                {fmtUSD(it.unitPriceCents * it.qty)}
                              </div>
                            </div>
                          </div>

                          {busy ? (
                            <div className="mt-2 text-xs text-white/60">Updating…</div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Summary */}
          <aside className="rounded-2xl border border-white/15 bg-white/5 p-4 sm:p-5 h-fit">
            <h2 className="text-lg font-bold text-white">Order Summary</h2>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between text-white/85">
                <span>Subtotal</span>
                <span className="font-semibold text-white">{fmtUSD(subtotal)}</span>
              </div>

              <div className="flex items-center justify-between text-white/70">
                <span>Shipping</span>
                <span>Calculated at checkout</span>
              </div>

              <div className="flex items-center justify-between text-white/70">
                <span>Tax</span>
                <span>Calculated at checkout</span>
              </div>

              <div className="border-t border-white/15 pt-3 flex items-center justify-between">
                <span className="text-white/85">Total</span>
                <span className="text-lg font-extrabold text-white">{fmtUSD(subtotal)}</span>
              </div>
            </div>

            <CheckoutButton disabled={!hasItems} />

            <p className="mt-3 text-xs text-white/60">
                    You’re one step away from checkout. You’ll be redirected to Stripe to complete payment.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
