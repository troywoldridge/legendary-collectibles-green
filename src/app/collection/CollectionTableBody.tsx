// src/app/collection/CollectionTableBody.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export type CollectionItem = {
  id: string;
  game: string | null;
  card_id: string | null;
  card_name: string | null;
  set_name: string | null;
  image_url: string | null;
  grading_company: string | null;
  grade_label: string | null;
  cert_number: string | null;
  quantity: number | null;
  folder: string | null;
  cost_cents: number | null;
  last_value_cents: number | null;
  created_at: string | null;
};

type Props = {
  items: CollectionItem[];
};

export default function CollectionTableBody({ items }: Props) {
  if (!items.length) {
    return (
      <tbody>
        <tr>
          <td
            colSpan={8}
            className="p-6 text-center text-white/70"
          >
            No items found. Try adjusting your filters.
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {items.map((item) => (
        <CollectionRow key={item.id} item={item} />
      ))}
    </tbody>
  );
}

/* ------------------------------------------------------------------ */

type RowProps = {
  item: CollectionItem;
};

function CollectionRow({ item }: RowProps) {
  const quantity = item.quantity ?? 0;
  const lastValue = item.last_value_cents ?? 0;
  const rowTotalCents = quantity > 0 ? quantity * lastValue : null;

  return (
    <tr className="border-b border-white/10 hover:bg-white/5">
      {/* Photo */}
      <td className="p-2">
        <div className="relative h-16 w-12 overflow-hidden rounded bg-black/40">
          {item.image_url ? (
            <Image
              src={item.image_url}
              alt={item.card_name ?? "Card"}
              fill
              unoptimized
              className="object-contain"
              sizes="48px"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-[10px] text-white/60">
              No image
            </div>
          )}
        </div>
      </td>

      {/* Card / Set */}
      <td className="p-2">
        <div className="text-sm font-semibold">
          {item.card_name ?? item.card_id ?? "Unknown card"}
        </div>
        <div className="text-xs text-white/60">
          {item.set_name ?? "—"}
        </div>
      </td>

      {/* Grade */}
      <td className="p-2">
        <GradeSelect item={item} />
      </td>

      {/* Qty */}
      <td className="p-2">
        <QtyInput item={item} />
      </td>

      {/* Folder */}
      <td className="p-2">
        <FolderInput item={item} />
      </td>

      {/* Cost */}
      <td className="p-2">
        <CostInput item={item} />
      </td>

      {/* Total value */}
      <td className="p-2 text-blue-300">
        {rowTotalCents != null
          ? `$${(rowTotalCents / 100).toFixed(2)}`
          : "—"}
      </td>

      {/* Actions */}
      <td className="p-2 space-y-1 text-sm">
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

/* ------------------------------------------------------------------ */
/* Inline editors                                                      */
/* ------------------------------------------------------------------ */

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

function normalizeCompany(
  raw: string | null,
): GradeCompany {
  if (raw === "PSA" || raw === "CGC" || raw === "UNGR") {
    return raw;
  }
  return "UNGR";
}

function GradeSelect({ item }: RowProps) {
  const initialCompany = normalizeCompany(item.grading_company);
  const initialGrade =
    item.grade_label ??
    GRADE_OPTIONS[initialCompany][0];

  const [company, setCompany] =
    useState<GradeCompany>(initialCompany);
  const [grade, setGrade] = useState<string>(initialGrade);

  async function update(nextCompany: GradeCompany, nextGrade: string) {
    await fetch("/api/collection/update", {
      method: "POST",
      body: JSON.stringify({
        id: item.id,
        grading_company: nextCompany,
        grade_label: nextGrade,
      }),
    });
  }

  return (
    <div className="flex gap-1">
      <select
        value={company}
        onChange={async (e) => {
          const nextCompany = normalizeCompany(e.target.value);
          const nextGrade =
            GRADE_OPTIONS[nextCompany][0] ?? "Ungraded";
          setCompany(nextCompany);
          setGrade(nextGrade);
          await update(nextCompany, nextGrade);
        }}
        className="rounded bg-white/10 px-2 py-1 text-xs"
      >
        <option value="UNGR">Ungraded</option>
        <option value="PSA">PSA</option>
        <option value="CGC">CGC</option>
      </select>

      <select
        value={grade}
        onChange={async (e) => {
          const nextGrade = e.target.value;
          setGrade(nextGrade);
          await update(company, nextGrade);
        }}
        className="rounded bg-white/10 px-2 py-1 text-xs"
      >
        {(GRADE_OPTIONS[company] ?? ["Ungraded"]).map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  );
}

function QtyInput({ item }: RowProps) {
  const [qty, setQty] = useState<number>(
    item.quantity ?? 1,
  );

  async function update(newQty: number) {
    setQty(newQty);
    await fetch("/api/collection/update", {
      method: "POST",
      body: JSON.stringify({
        id: item.id,
        quantity: newQty,
      }),
    });
  }

  return (
    <input
      type="number"
      min={1}
      value={qty}
      onChange={(e) => {
        const v = Math.max(1, Number(e.target.value) || 1);
        update(v);
      }}
      className="w-16 rounded bg-white/10 px-2 py-1 text-xs"
    />
  );
}

function FolderInput({ item }: RowProps) {
  const [folder, setFolder] = useState<string>(
    item.folder ?? "",
  );

  async function update(newFolder: string) {
    setFolder(newFolder);
    await fetch("/api/collection/update", {
      method: "POST",
      body: JSON.stringify({
        id: item.id,
        folder: newFolder || null,
      }),
    });
  }

  return (
    <input
      type="text"
      value={folder}
      onChange={(e) => update(e.target.value)}
      className="w-28 rounded bg-white/10 px-2 py-1 text-xs"
    />
  );
}

function CostInput({ item }: RowProps) {
  const [cost, setCost] = useState<string>(
    item.cost_cents != null
      ? (item.cost_cents / 100).toString()
      : "",
  );

  async function update(raw: string) {
    setCost(raw);
    const val = raw.trim();
    await fetch("/api/collection/update", {
      method: "POST",
      body: JSON.stringify({
        id: item.id,
        cost_cents: val
          ? Math.round(Number(val) * 100)
          : null,
      }),
    });
  }

  return (
    <input
      type="number"
      min={0}
      step="0.01"
      value={cost}
      onChange={(e) => update(e.target.value)}
      className="w-24 rounded bg:white/10 px-2 py-1 text-xs bg-white/10"
    />
  );
}

function RemoveButton({ id }: { id: string }) {
  async function remove() {
    if (!confirm("Remove item from collection?")) return;

    await fetch("/api/collection/delete", {
      method: "POST",
      body: JSON.stringify({ id }),
    });

    // Quick-and-dirty refresh
    window.location.reload();
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
