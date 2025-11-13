/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import CardPicker from "@/components/pro/CardPicker";

export default function AlertsForm() {
  const router = useRouter();
  const [game, setGame] = useState<"yugioh" | "pokemon" | "mtg">("yugioh");
  const [cardId, setCardId] = useState<string>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      game,
      cardId,
      source: String(fd.get("source")),
      ruleType: String(fd.get("ruleType")),
      threshold: String(fd.get("threshold")),
    };
    const res = await fetch("/api/pro/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      router.refresh();
      (e.target as HTMLFormElement).reset();
      setCardId("");
    } else {
      console.error(await res.text());
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="grid sm:grid-cols-5 gap-2">
        <select
          value={game}
          onChange={(e) => setGame(e.target.value as any)}
          className="rounded bg-white/10 text-white px-2 py-2"
        >
          <option value="yugioh">Yu-Gi-Oh!</option>
          <option value="pokemon">Pokémon</option>
          <option value="mtg">MTG</option>
        </select>

        <CardPicker
          game={game}
          value={cardId}
          onChange={(id) => setCardId(id)}
          placeholder={game === "mtg" ? "Search MTG (name / set code / number)" : "Search card name…"}
        />

        <select name="source" className="rounded bg-white/10 text-white px-2 py-2">
          <option value="tcgplayer">TCGplayer</option>
          <option value="cardmarket">Cardmarket</option>
          <option value="ebay">eBay</option>
          <option value="amazon">Amazon</option>
          <option value="coolstuffinc">CoolStuffInc</option>
        </select>
        <select name="ruleType" className="rounded bg-white/10 text-white px-2 py-2">
          <option value="above">Above</option>
          <option value="below">Below</option>
        </select>
        <input name="threshold" placeholder="USD (e.g., 12.50)" className="rounded bg-white/10 text-white px-2 py-2"/>
      </div>
    </form>
  );
}
