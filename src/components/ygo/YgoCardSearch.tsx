"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

type Result = {
  id: string;
  name: string;
  type: string | null;
  attribute: string | null;
  race: string | null;
  thumb: string | null;
};

export default function YgoCardSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [idx, setIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Debounced fetch
  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      setIdx(-1);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    if (abortRef.current) abortRef.current.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ygo/search?q=${encodeURIComponent(q.trim())}`, {
          signal: ctl.signal,
          cache: "no-store",
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}${txt ? ` – ${txt}` : ""}`);
        }
        const data = (await res.json()) as { results: Result[]; error?: string };
        if (data.error) throw new Error(data.error);
        setResults(data.results ?? []);
        setIdx((data.results?.length ?? 0) > 0 ? 0 : -1);
        setOpen(true);
      } catch (e: unknown) {
        console.error("YgoCardSearch fetch error:", e);
        setResults([]);
        setIdx(-1);
        setOpen(true); // keep panel open to show the error
        setError("Search failed");
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const go = (r: Result | null) => {
    const target = r?.id || (results[0]?.id ?? null);
    if (!target) return;
    setOpen(false);
    router.push(`/categories/yugioh/cards/${encodeURIComponent(target)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((v) => (results.length ? (v + 1) % results.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((v) => (results.length ? (v - 1 + results.length) % results.length : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = idx >= 0 ? results[idx] : results[0] ?? null;
      go(chosen);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const placeholder = useMemo(
    () => "Search Yu-Gi-Oh! cards (name or exact Card ID)…",
    []
  );

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
        <svg width="18" height="18" viewBox="0 0 24 24" className="opacity-70">
          <path fill="currentColor" d="M21 20.29L17.31 16.6A7.92 7.92 0 0019 11a8 8 0 10-8 8a7.92 7.92 0 005.6-1.69L20.29 21zM5 11a6 6 0 116 6a6 6 0 01-6-6" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => (results.length || error) && setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none placeholder-white/50 text-white"
          aria-label="Search Yu-Gi-Oh! cards"
        />
        {loading ? (
          <span className="text-xs text-white/60">Searching…</span>
        ) : results.length ? (
          <span className="text-xs text-white/60">{results.length} results</span>
        ) : error ? (
          <span className="text-xs text-rose-300">Error</span>
        ) : null}
      </div>

      {open && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-white/15 bg-black/70 backdrop-blur-md">
          {error ? (
            <div className="p-3 text-sm text-rose-300">Search failed. Check console for details.</div>
          ) : results.length === 0 ? (
            <div className="p-3 text-sm text-white/70">No matches.</div>
          ) : (
            <ul className="max-h-80 overflow-auto divide-y divide-white/10">
              {results.map((r, i) => {
                const active = i === idx;
                return (
                  <li
                    key={r.id}
                    onMouseEnter={() => setIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(r);
                    }}
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition ${
                      active ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="relative h-10 w-7 shrink-0 rounded">
                      {r.thumb ? (
                        <Image
                          src={r.thumb}
                          alt={r.name}
                          fill
                          sizes="28px"
                          className="object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="h-10 w-7 rounded bg-white/10" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm text-white">{r.name}</div>
                      <div className="truncate text-xs text-white/60">
                        {r.id}
                        {r.type ? ` • ${r.type}` : ""}
                        {r.attribute ? ` • ${r.attribute}` : ""}
                        {r.race ? ` • ${r.race}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
