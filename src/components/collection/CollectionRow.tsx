"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export type CollectionItem = {
  id: string;
  game: string;
  card_id: string;
  card_name: string | null;
  set_name: string | null;
  image_url: string | null;
  grading_company: string | null;
  grade_label: string | null;
  quantity: number;
  folder: string | null;
  cost_cents: number | null;
  last_value_cents: number | null;
};

type Props = {
  item: CollectionItem;
};

function gameLabel(game: string): string {
  const g = game.toLowerCase();
  if (g === "pokemon") return "Pokémon";
  if (g === "mtg" || g === "magic") return "Magic";
  if (g === "ygo" || g === "yugioh") return "Yu-Gi-Oh!";
  return game;
}

function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function CollectionRow({ item }: Props) {
  const [company, setCompany] = useState(item.grading_company ?? "UNGR");
  const [grade, setGrade] = useState(item.grade_label ?? "Ungraded");
  const [qty, setQty] = useState(item.quantity ?? 1);
  const [folder, setFolder] = useState(item.folder ?? "");
  const [cost, setCost] = useState(
    item.cost_cents != null ? (item.cost_cents / 100).toString() : ""
  );
  const [saving, setSaving] = useState(false);

  const img =
    item.image_url && item.image_url.length
      ? item.image_url.replace(/^http:\/\//i, "https://")
      : "/placeholder.png";

  const perCostCents = item.cost_cents ?? 0;
  const perValueCents = item.last_value_cents ?? perCostCents;
  const totalCostCents = perCostCents * qty;
  const totalValueCents = perValueCents * qty;
  const gainCents = totalValueCents - totalCostCents;
  const ratio =
    totalCostCents > 0 ? Math.min(totalValueCents / totalCostCents, 2) : 0;

  const gradeOptions: Record<string, string[]> = {
    UNGR: ["Ungraded"],
    PSA: [
      "PSA 10",
      "PSA 9",
      "PSA 8",
      "PSA 7",
      "PSA 6",
      "PSA 5",
      "PSA 4",
      "PSA 3",
      "PSA 2",
      "PSA 1",
    ],
    CGC: ["CGC 10", "CGC 9.5", "CGC 9", "CGC 8.5", "CGC 8", "CGC 7.5", "CGC 7"],
  };
  const grades = gradeOptions[company] ?? gradeOptions.UNGR;

  async function update(partial: Record<string, unknown>) {
    try {
      setSaving(true);
      await fetch("/api/collection/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, ...partial }),
      });
    } catch (err) {
      console.error("Failed to update collection item", err);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Remove item from collection?")) return;
    try {
      await fetch("/api/collection/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      window.location.reload();
    } catch (err) {
      console.error("Failed to remove collection item", err);
    }
  }

  // Detail link per game
  let detailHref: string | null = null;
  if (item.card_id) {
    const encoded = encodeURIComponent(item.card_id);
    if (item.game === "pokemon")
      detailHref = `/categories/pokemon/cards/${encoded}`;
    else if (item.game === "mtg")
      detailHref = `/categories/mtg/cards/${encoded}`;
    else if (item.game === "yugioh" || item.game === "ygo")
      detailHref = `/categories/yugioh/cards/${encoded}`;
  }

  return (
    <tr className="border-b border-white/10 hover:bg-white/5">
      {/* Photo */}
      <td className="p-2 align-top">
        {detailHref ? (
          <Link href={detailHref}>
            <Image
              src={img}
              alt={item.card_name ?? "Card image"}
              width={50}
              height={70}
              className="rounded"
            />
          </Link>
        ) : (
          <Image
            src={img}
            alt={item.card_name ?? "Card image"}
            width={50}
            height={70}
            className="rounded"
          />
        )}
      </td>

      {/* Item text */}
      <td className="p-2 align-top">
        <div className="font-semibold">
          {item.card_name ?? "(Unnamed card)"}
        </div>
        <div className="text-xs text-white/60">
          {item.set_name ?? "Unknown set"}
        </div>
        <div className="mt-0.5 text-[11px] text-white/50">
          {gameLabel(item.game)}
        </div>
      </td>

      {/* Grade */}
      <td className="p-2 align-top">
        <div className="flex gap-2">
          <select
            value={company}
            onChange={(e) => {
              const next = e.target.value;
              setCompany(next);
              const nextGrade = (gradeOptions[next] ?? gradeOptions.UNGR)[0];
              setGrade(nextGrade);
              update({ grading_company: next, grade_label: nextGrade });
            }}
            className="rounded bg-white/10 px-2 py-1 text-xs"
          >
            <option value="UNGR">Ungraded</option>
            <option value="PSA">PSA</option>
            <option value="CGC">CGC</option>
          </select>

          <select
            value={grade}
            onChange={(e) => {
              const val = e.target.value;
              setGrade(val);
              update({ grade_label: val });
            }}
            className="rounded bg-white/10 px-2 py-1 text-xs"
          >
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </td>

      {/* Qty */}
      <td className="p-2 align-top">
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => {
            const n = Math.max(1, Number(e.target.value) || 1);
            setQty(n);
            update({ quantity: n });
          }}
          className="w-16 rounded bg-white/10 px-2 py-1 text-sm"
        />
      </td>

      {/* Folder */}
      <td className="p-2 align-top">
        <input
          type="text"
          value={folder}
          onChange={(e) => {
            const val = e.target.value;
            setFolder(val);
            update({ folder: val || null });
          }}
          className="w-28 rounded bg-white/10 px-2 py-1 text-sm"
        />
      </td>

      {/* Cost */}
      <td className="p-2 align-top">
        <input
          type="number"
          min={0}
          step="0.01"
          value={cost}
          onChange={(e) => {
            const v = e.target.value;
            setCost(v);
            const num = v ? Number(v) : NaN;
            update({
              cost_cents: Number.isFinite(num) ? Math.round(num * 100) : null,
            });
          }}
          className="w-24 rounded bg-white/10 px-2 py-1 text-sm"
        />
      </td>

      {/* Value + mini bar chart */}
      <td className="p-2 align-top text-sm">
        <div className="font-semibold text-blue-300">
          {formatMoney(totalValueCents)}
        </div>
        <div className="text-xs text-white/60">
          Cost: {formatMoney(totalCostCents)}{" "}
          {totalCostCents > 0 && (
            <span
              className={
                gainCents > 0
                  ? "text-emerald-300"
                  : gainCents < 0
                  ? "text-red-300"
                  : ""
              }
            >
              ({gainCents >= 0 ? "+" : "-"}
              {Math.abs(gainCents / 100).toFixed(2)})
            </span>
          )}
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={`h-full ${
              ratio >= 1 ? "bg-emerald-400" : "bg-amber-400"
            }`}
            style={{
              width: `${Math.max(5, Math.min(100, ratio * 100))}%`,
            }}
          />
        </div>
      </td>

      {/* Actions */}
      <td className="p-2 align-top">
        <div className="space-y-1 text-xs">
          {detailHref && (
            <Link
              href={detailHref}
              className="block text-sky-300 hover:underline"
            >
              View card
            </Link>
          )}
          <Link
            href={`/collection/edit/${item.id}`}
            className="block text-blue-300 hover:underline"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={remove}
            className="block text-red-400 hover:underline"
            disabled={saving}
          >
            {saving ? "Removing..." : "Remove"}
          </button>
        </div>
      </td>
    </tr>
  );
}
