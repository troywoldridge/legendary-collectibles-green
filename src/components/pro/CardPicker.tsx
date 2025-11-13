"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  game: "yugioh" | "pokemon" | "mtg";
  value?: string;
  onChange?: (id: string) => void;
  placeholder?: string;
};

type Sugg = { id: string; label: string; sub?: string | null };

export default function CardPicker({ game, value = "", onChange, placeholder }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggs, setSuggs] = useState<Sugg[]>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // Fetch suggestions (no sync setState calls here)
  useEffect(() => {
    const qTrim = q.trim();
    if (qTrim.length < 2) return;

    const controller = new AbortController();

    (async () => {
      try {
        const r = await fetch(
          `/api/pro/search-cards?game=${game}&q=${encodeURIComponent(qTrim)}&limit=10`,
          { signal: controller.signal, cache: "no-store" }
        );
        const j = await r.json().catch(() => ({}));
        setSuggs(Array.isArray(j.results) ? j.results : []);
      } catch {
        /* ignore */
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [q, game]);

  function choose(s: Sugg) {
    setQ(s.label);
    setOpen(false);
    onChange?.(s.id);
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          setOpen(true);

          const len = v.trim().length;
          if (len < 2) {
            setSuggs([]);
            if (loading) setLoading(false);
          } else {
            // turn spinner on here (not inside the effect)
            if (!loading) setLoading(true);
          }
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || "Search card name…"}
        className="w-full rounded bg-white/10 text-white px-2 py-2"
        autoComplete="off"
      />

      {open && (suggs.length > 0 || loading) && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/15 bg-[#0b0f17]">
          {loading ? (
            <div className="px-3 py-2 text-white/60 text-sm">Searching…</div>
          ) : (
            suggs.map((s) => (
              <button
                key={s.id}
                className="w-full text-left px-3 py-2 hover:bg-white/10"
                onClick={() => choose(s)}
                type="button"
              >
                <div className="text-white text-sm">{s.label}</div>
                {s.sub ? <div className="text-white/60 text-xs">{s.sub}</div> : null}
              </button>
            ))
          )}
        </div>
      )}

      {value ? (
        <div className="mt-1 text-xs text-white/70">
          Selected ID: <span className="font-mono">{value}</span>
        </div>
      ) : null}
    </div>
  );
}
