'use client';

import { useEffect, useState } from 'react';

type Props = {
  /** Scryfall UUID for the MTG card */
  cardId: string;
  /** Show only if primary price is missing (default) or always */
  showWhen?: 'missing' | 'always';
  /** Whether a primary price (Scryfall/effective) exists */
  hasPrimaryPrice?: boolean;
  /** Optional override for the eBay search query (server builds a decent default; this just boosts hit rate) */
  q?: string;
  className?: string;
};

export default function EbayFallbackPrice({
  cardId,
  showWhen = 'missing',
  hasPrimaryPrice,
  q,
  className,
}: Props) {
  const [state, setState] = useState<{
    loading: boolean;
    tried: boolean;
    price?: string | null;
    url?: string | null;
    error?: string | null;
  }>({ loading: false, tried: false, price: null, url: null, error: null });

  const shouldShow = showWhen === 'always' || !hasPrimaryPrice;

  useEffect(() => {
    if (!shouldShow) return;
    let cancelled = false;

    (async () => {
      setState((s) => ({ ...s, loading: true, tried: false, error: null }));
      try {
        const u = new URL(`/api/ebay/price/${encodeURIComponent(cardId)}`, window.location.origin);
        // Don’t persist from the client render; the nightly cron handles DB writes.
        u.searchParams.set('persist', '0');
        if (q && q.trim()) u.searchParams.set('q', q.trim());

        const res = await fetch(u.toString(), { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const j = await res.json();
        const price = j?.item?.price?.value ?? null;
        const url = j?.item?.itemWebUrl ?? null;

        if (!cancelled) {
          setState({ loading: false, tried: true, price, url, error: null });
        }
      } catch (err: any) {
        if (!cancelled) {
          setState({ loading: false, tried: true, price: null, url: null, error: err?.message ?? 'error' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cardId, q, shouldShow]);

  // If we’re not supposed to show, bail out
  if (!shouldShow) return null;

  // Quietly no-op if nothing found / still loading; we only surface a card when we actually have a number
  if (state.loading && !state.tried) {
    return (
      <div className={className}>
        <div className="text-sm text-white/60">Checking eBay…</div>
      </div>
    );
  }
  if (!state.price) return null;

  return (
    <section className={`rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm ${className ?? ''}`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Market Prices (eBay)</h2>
        <div className="text-xs text-white/60">Live lookup</div>
      </div>
      <div className="text-white text-lg font-semibold">
        ${Number(state.price).toFixed(2)}
        {state.url ? (
          <a href={state.url} target="_blank" className="ml-2 text-sky-300 underline" rel="noreferrer">
            View on eBay
          </a>
        ) : null}
      </div>
    </section>
  );
}
