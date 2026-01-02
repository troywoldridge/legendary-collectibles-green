import "server-only";

type MoversRow = {
  game: string;
  card_id: string;
  card_name?: string | null;
  set_name?: string | null;
  qty?: number | null;

  // cents fields (recommended)
  start_value_cents?: number | null;
  end_value_cents?: number | null;
  change_cents?: number | null;
  change_pct?: number | null;

  // dollars fallbacks (if your endpoint returns dollars)
  start_value?: number | null;
  end_value?: number | null;
  change?: number | null;
  pct?: number | null;
};

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function toCentsMaybe(row: MoversRow, keyCents: keyof MoversRow, keyDollars: keyof MoversRow): number | null {
  const c = asNumber(row[keyCents]);
  if (c != null) return Math.round(c);
  const d = asNumber(row[keyDollars]);
  if (d != null) return Math.round(d * 100);
  return null;
}

function fmtMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(p: number | null | undefined): string {
  if (p == null) return "—";
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}

function gameLabel(g: string) {
  const x = (g || "").toLowerCase();
  if (x === "pokemon") return "Pokémon";
  if (x === "mtg" || x === "magic") return "MTG";
  if (x === "ygo" || x === "yugioh") return "Yu-Gi-Oh!";
  return g || "Other";
}

export default async function MoversInlinePanel({
  days = 7,
  limit = 8,
}: {
  days?: number;
  limit?: number;
}) {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/pro/exports/movers?days=${days}&limit=${limit}`,
    { cache: "no-store" },
  ).catch(() => null);

  // If you're not setting NEXT_PUBLIC_SITE_URL, fallback to relative fetch.
  const finalRes =
    res ??
    (await fetch(`/api/pro/exports/movers?days=${days}&limit=${limit}`, { cache: "no-store" }).catch(() => null));

  if (!finalRes || !finalRes.ok) {
    return (
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="text-sm font-semibold text-white">Movers</div>
        <div className="mt-1 text-xs text-white/60">
          We couldn’t load movers yet. Make sure the movers endpoint is working.
        </div>
      </div>
    );
  }

  const json = (await finalRes.json()) as { rows?: MoversRow[]; data?: MoversRow[]; items?: MoversRow[] };
  const rows: MoversRow[] = (json.rows ?? json.data ?? json.items ?? []) as MoversRow[];

  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
        <div className="text-sm font-semibold text-white">Movers</div>
        <div className="mt-1 text-xs text-white/60">
          No movers found yet (need more price history).
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Movers</div>
          <div className="text-xs text-white/60">Top changes over the last {days} days</div>
        </div>
        <a
          href={`/api/pro/exports/movers?days=${days}&limit=200`}
          className="text-xs text-sky-300 hover:underline"
        >
          Download CSV
        </a>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-white/60">
            <tr>
              <th className="px-3 py-2 text-left">Card</th>
              <th className="px-3 py-2 text-right">Start</th>
              <th className="px-3 py-2 text-right">Now</th>
              <th className="px-3 py-2 text-right">Change</th>
              <th className="px-3 py-2 text-right">% </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.slice(0, limit).map((r, idx) => {
              const startC = toCentsMaybe(r, "start_value_cents", "start_value");
              const endC = toCentsMaybe(r, "end_value_cents", "end_value");
              const chgC = toCentsMaybe(r, "change_cents", "change");
              const pct = asNumber(r.change_pct ?? r.pct);

              return (
                <tr key={`${r.game}-${r.card_id}-${idx}`} className="bg-black/10">
                  <td className="px-3 py-2">
                    <div className="text-white/90">
                      {r.card_name ?? r.card_id}
                    </div>
                    <div className="text-xs text-white/60">
                      {gameLabel(r.game)}{r.set_name ? ` • ${r.set_name}` : ""}{r.qty ? ` • Qty ${r.qty}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-white/80">{fmtMoney(startC)}</td>
                  <td className="px-3 py-2 text-right text-white/80">{fmtMoney(endC)}</td>
                  <td
                    className={`px-3 py-2 text-right ${
                      (chgC ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {chgC == null ? "—" : `${chgC >= 0 ? "+" : "-"}${fmtMoney(Math.abs(chgC))}`}
                  </td>
                  <td
                    className={`px-3 py-2 text-right ${
                      (pct ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {fmtPct(pct)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[11px] text-white/50">
        Note: movers require historical price snapshots to compute deltas.
      </div>
    </div>
  );
}
