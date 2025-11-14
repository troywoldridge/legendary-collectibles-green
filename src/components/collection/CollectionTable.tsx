"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

type CollectionItem = {
  id: string;
  user_id: string;
  game: string | null;
  card_id: string | null;
  card_name: string | null;
  set_name: string | null;
  image_url: string | null;
  grading_company: string | null;
  grade_label: string | null;
  cert_number: string | null;
  purchase_date: string | null;
  quantity: number | null;
  folder: string | null;
  cost_cents: number | null;
  last_value_cents: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type Props = {
  items: CollectionItem[];
};

type GradeCompany = "UNGR" | "PSA" | "CGC";

const GRADE_OPTIONS: Record<GradeCompany, string[]> = {
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

export default function CollectionTable({ items }: Props) {
  return (
    <div className="w-full overflow-x-auto rounded bg-white/5">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-white/10 text-left">
          <tr>
            <th className="p-2">Photo</th>
            <th className="p-2">Item</th>
            <th className="p-2">Grade</th>
            <th className="p-2">Qty</th>
            <th className="p-2">Folder</th>
            <th className="p-2">Cost</th>
            <th className="p-2">Last Value</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>

        <tbody>
          {items.length === 0 && (
            <tr>
              <td
                colSpan={8}
                className="p-6 text-center text-white/70"
              >
                No items found.
              </td>
            </tr>
          )}

          {items.map((item) => (
            <CollectionRow key={item.id} item={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Row ---------------- */

function CollectionRow({ item }: { item: CollectionItem }) {
  return (
    <tr className="border-b border-white/10 hover:bg-white/5">
      {/* Photo */}
      <td className="p-2">
        <Image
          src={item.image_url || "/placeholder.png"}
          alt={item.card_name || "Card image"}
          width={50}
          height={70}
          className="rounded"
          unoptimized
        />
      </td>

      {/* Card / Set */}
      <td className="p-2 align-top">
        <div className="font-semibold">
          {item.card_name || item.card_id || "Unknown card"}
        </div>
        <div className="text-xs text-white/60">
          {item.set_name || "—"}
        </div>
      </td>

      {/* Grade dropdown */}
      <td className="p-2 align-top">
        <GradeSelect item={item} />
      </td>

      {/* Quantity */}
      <td className="p-2 align-top">
        <QtyInput item={item} />
      </td>

      {/* Folder */}
      <td className="p-2 align-top">
        <FolderInput item={item} />
      </td>

      {/* Cost */}
      <td className="p-2 align-top">
        <CostInput item={item} />
      </td>

      {/* Last value */}
      <td className="p-2 align-top text-blue-400 font-semibold">
        {item.last_value_cents != null
          ? `$${(item.last_value_cents / 100).toFixed(2)}`
          : "—"}
      </td>

      {/* Edit + Remove */}
      <td className="p-2 align-top space-y-1">
        <Link
          href={`/collection/edit/${item.id}`}
          className="block text-blue-400 hover:underline"
        >
          Edit
        </Link>

        <RemoveButton id={item.id} />
      </td>
    </tr>
  );
}

/* ---------------- Grade select ---------------- */

function GradeSelect({ item }: { item: CollectionItem }) {
  const initialCompany: GradeCompany =
    (item.grading_company as GradeCompany | null) ?? "UNGR";

  const initialGrade =
    item.grade_label &&
    GRADE_OPTIONS[initialCompany].includes(item.grade_label)
      ? item.grade_label
      : GRADE_OPTIONS[initialCompany][0];

  const [company, setCompany] = useState<GradeCompany>(initialCompany);
  const [grade, setGrade] = useState<string>(initialGrade);

  const grades = GRADE_OPTIONS[company];

  async function update(nextCompany: GradeCompany, nextGrade: string) {
    try {
      await fetch("/api/collection/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          grading_company: nextCompany,
          grade_label: nextGrade,
        }),
      });
    } catch (err) {
      console.error("Failed to update grade", err);
    }
  }

  return (
    <div className="flex gap-2">
      <select
        value={company}
        onChange={(e) => {
          const nextCompany = e.target.value as GradeCompany;
          const nextGrade = GRADE_OPTIONS[nextCompany][0];
          setCompany(nextCompany);
          setGrade(nextGrade);
          void update(nextCompany, nextGrade);
        }}
        className="rounded bg-white/10 p-1 text-xs"
      >
        <option value="UNGR">Ungraded</option>
        <option value="PSA">PSA</option>
        <option value="CGC">CGC</option>
      </select>

      <select
        value={grade}
        onChange={(e) => {
          const nextGrade = e.target.value;
          setGrade(nextGrade);
          void update(company, nextGrade);
        }}
        className="rounded bg-white/10 p-1 text-xs"
      >
        {grades.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ---------------- Qty input ---------------- */

function QtyInput({ item }: { item: CollectionItem }) {
  const [qty, setQty] = useState<number>(item.quantity ?? 1);

  async function update(newQty: number) {
    setQty(newQty);
    try {
      await fetch("/api/collection/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          quantity: newQty,
        }),
      });
    } catch (err) {
      console.error("Failed to update quantity", err);
    }
  }

  return (
    <input
      type="number"
      min={1}
      value={qty}
      onChange={(e) => update(Math.max(1, Number(e.target.value) || 1))}
      className="w-16 rounded bg-white/10 px-2 py-1 text-sm"
    />
  );
}

/* ---------------- Folder input ---------------- */

function FolderInput({ item }: { item: CollectionItem }) {
  const [folder, setFolder] = useState<string>(item.folder ?? "");

  async function update(newFolder: string) {
    setFolder(newFolder);
    try {
      await fetch("/api/collection/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          folder: newFolder || null,
        }),
      });
    } catch (err) {
      console.error("Failed to update folder", err);
    }
  }

  return (
    <input
      type="text"
      value={folder}
      onChange={(e) => update(e.target.value)}
      className="w-28 rounded bg-white/10 px-2 py-1 text-sm"
    />
  );
}

/* ---------------- Cost input ---------------- */

function CostInput({ item }: { item: CollectionItem }) {
  const [cost, setCost] = useState<string>(
    item.cost_cents != null ? (item.cost_cents / 100).toFixed(2) : ""
  );

  async function update(val: string) {
    setCost(val);
    try {
      const num = val ? Number(val) : NaN;
      await fetch("/api/collection/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          cost_cents: Number.isFinite(num) ? Math.round(num * 100) : null,
        }),
      });
    } catch (err) {
      console.error("Failed to update cost", err);
    }
  }

  return (
    <input
      type="number"
      min={0}
      step="0.01"
      value={cost}
      onChange={(e) => update(e.target.value)}
      className="w-24 rounded bg-white/10 px-2 py-1 text-sm"
    />
  );
}

/* ---------------- Remove button ---------------- */

function RemoveButton({ id }: { id: string }) {
  async function remove() {
    if (!confirm("Remove item from collection?")) return;

    try {
      await fetch("/api/collection/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      // Quick & dirty refresh
      window.location.reload();
    } catch (err) {
      console.error("Failed to remove item", err);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      className="text-red-400 hover:underline"
    >
      Remove
    </button>
  );
}
