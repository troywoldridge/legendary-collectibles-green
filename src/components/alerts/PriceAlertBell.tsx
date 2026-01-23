"use client";

import { useMemo, useState } from "react";

type GameKey = "pokemon" | "yugioh" | "mtg" | "funko";

type Props = {
  game: GameKey;
  marketItemId: string;
  label: string;
  currentUsd?: number | null;
  className?: string;
};



function fmtUsd(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function PriceAlertBell({
  game,
  marketItemId,
  label,
  currentUsd,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const suggested = useMemo(() => {
    if (currentUsd == null || !Number.isFinite(currentUsd)) return null;
    // quick “reasonable” presets
    const up10 = Math.max(0.01, currentUsd * 1.1);
    const down10 = Math.max(0.01, currentUsd * 0.9);
    return { up10, down10 };
  }, [currentUsd]);

  async function save() {
    setMsg(null);

    const t = Number(threshold);
    if (!Number.isFinite(t) || t <= 0) {
      setMsg({ kind: "err", text: "Enter a valid price (USD)." });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/pro/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          game,
          market_item_id: marketItemId,
          rule_type: rule,
          threshold: t,
        }),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

      setMsg({ kind: "ok", text: "Alert saved." });
      // keep modal open briefly; user might want to set another
      setTimeout(() => setOpen(false), 450);
    } catch (e: any) {
      const raw = String(e?.message || "Failed to save alert.");
      // common: plan gate from API
      if (raw.includes("402") || raw.toLowerCase().includes("pro required")) {
        setMsg({ kind: "err", text: "Pro required to create alerts." });
      } else {
        setMsg({ kind: "err", text: "Failed to save alert. Check logs if it persists." });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMsg(null);
          // helpful default: if current price exists, prefill
          if (!threshold && currentUsd != null && Number.isFinite(currentUsd)) {
            setThreshold(currentUsd.toFixed(2));
          }
          setOpen(true);
        }}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
        }
        title="Create price alert"
      >
        <span aria-hidden>🔔</span>
        <span>Alert</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/20 bg-zinc-950 p-4 text-white shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Create price alert</div>
                <div className="mt-1 text-xs text-white/60">
                  {label ? label : "This card"} • {game.toUpperCase()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">Rule</div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRule("above")}
                    className={
                      rule === "above"
                        ? "rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-100"
                        : "rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
                    }
                  >
                    Above
                  </button>
                  <button
                    type="button"
                    onClick={() => setRule("below")}
                    className={
                      rule === "below"
                        ? "rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-2 text-xs font-medium text-sky-100"
                        : "rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
                    }
                  >
                    Below
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-white/60">Target price (USD)</div>
                <input
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 24.99"
                  className="mt-2 w-full rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/25"
                />
                <div className="mt-1 text-[11px] text-white/50">
                  {currentUsd != null && Number.isFinite(currentUsd)
                    ? `Current: ${fmtUsd(currentUsd)}`
                    : "Current price unavailable"}
                </div>
              </div>
            </div>

            {suggested && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRule("above");
                    setThreshold(suggested.up10.toFixed(2));
                  }}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                >
                  +10% ({fmtUsd(suggested.up10)})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRule("below");
                    setThreshold(suggested.down10.toFixed(2));
                  }}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10"
                >
                  −10% ({fmtUsd(suggested.down10)})
                </button>
              </div>
            )}

            {msg && (
              <div
                className={
                  msg.kind === "ok"
                    ? "mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100"
                    : "mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100"
                }
              >
                {msg.text}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-50 hover:bg-emerald-500/30 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save alert"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
