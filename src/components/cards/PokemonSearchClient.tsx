"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type CardResult = {
  id: string;
  name: string | null;
  number: string | null;
  set_name: string | null;
  series: string | null;
  small_image: string | null;
  rarity: string | null;
  lang: string;
};

export default function PokemonSearchClient() {
  const params = useSearchParams();
  const router = useRouter();

  const initialQ = params.get("q") || "";
  const initialLang = params.get("lang") || "en";

  const [q, setQ] = useState(initialQ);
  const [lang, setLang] = useState<"en" | "ja">(initialLang === "ja" ? "ja" : "en");
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<CardResult[]>([]);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    sp.set("lang", lang);
    return sp.toString();
  }, [q, lang]);

  // keep URL in sync (shareable)
  useEffect(() => {
    router.replace(`?${queryString}`);
  }, [queryString, router]);

  // fetch results
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        const res = await fetch(`/api/cards/search?${queryString}`, { cache: "no-store" });
        const data = await res.json();
        if (!cancelled) setCards(data.cards || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [queryString]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={lang === "ja" ? "カード名 / セット名…" : "Card name / set name…"}
            className="w-full sm:w-[420px] rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm"
          />

          <button
            onClick={() => setQ("")}
            className="rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm"
          >
            Clear
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm opacity-80">Language:</span>
          <button
            onClick={() => setLang("en")}
            className={`rounded-md px-3 py-2 text-sm border border-white/10 ${
              lang === "en" ? "bg-white/10" : "bg-black/40"
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLang("ja")}
            className={`rounded-md px-3 py-2 text-sm border border-white/10 ${
              lang === "ja" ? "bg-white/10" : "bg-black/40"
            }`}
          >
            JA
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm opacity-80">Loading…</div>
      ) : (
        <div className="text-sm opacity-80">
          Results: {cards.length}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <a
            key={c.id}
            href={`/pokemon/cards/${encodeURIComponent(c.id)}`} // adjust to your card route
            className="rounded-lg border border-white/10 bg-black/30 p-2 hover:bg-white/5"
          >
            {c.small_image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.small_image} alt={c.name || "Card"} className="w-full rounded-md" />
            ) : (
              <div className="aspect-[3/4] w-full rounded-md bg-white/5" />
            )}

            <div className="mt-2 text-xs font-medium line-clamp-2">{c.name}</div>
            <div className="text-[11px] opacity-70">
              {c.set_name} {c.number ? `• #${c.number}` : ""}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
