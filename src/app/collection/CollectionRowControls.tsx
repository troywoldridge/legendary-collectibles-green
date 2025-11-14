"use client";

import { useState } from "react";

export type CollectionItem = {
  id: string;
  grading_company: string | null;
  grade_label: string | null;
  quantity: number;
  folder: string | null;
  cost_cents: number | null;
};

type GradeCompany = "PSA" | "CGC" | "UNGR";

const GRADE_OPTIONS: Record<GradeCompany, string[]> = {
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
  UNGR: ["Ungraded"],
};

export function GradeSelect({ item }: { item: CollectionItem }) {
  const [company, setCompany] = useState<GradeCompany>(
    (item.grading_company as GradeCompany) ?? "UNGR"
  );
  const [grade, setGrade] = useState<string>(
    item.grade_label ?? GRADE_OPTIONS[company][0]
  );

  async function update() {
    await fetch("/api/collection/update", {
      method: "POST",
      body: JSON.stringify({
        id: item.id,
        grading_company: company,
        grade_label: grade,
      }),
    });
  }

  return (
    <div className="flex gap-2">
      <select
        value={company}
        onChange={(e) => {
          const newCompany = e.target.value as GradeCompany;
          setCompany(newCompany);
          const defaultGrade = GRADE_OPTIONS[newCompany][0];
          setGrade(defaultGrade);
          update();
        }}
        className="bg-white/10 p-1 rounded"
      >
        <option value="UNGR">Ungraded</option>
        <option value="PSA">PSA</option>
        <option value="CGC">CGC</option>
      </select>

      <select
        value={grade}
        onChange={(e) => {
          setGrade(e.target.value);
          update();
        }}
        className="bg-white/10 p-1 rounded"
      >
        {GRADE_OPTIONS[company].map((g) => (
          <option key={g}>{g}</option>
        ))}
      </select>
    </div>
  );
}

export function QtyInput({ item }: { item: CollectionItem }) {
  const [qty, setQty] = useState<number>(item.quantity);

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
      onChange={(e) => update(Number(e.target.value))}
      className="w-16 bg-white/10 rounded px-2"
    />
  );
}

export function FolderInput({ item }: { item: CollectionItem }) {
  const [folder, setFolder] = useState<string>(item.folder ?? "");

  async function update(newFolder: string) {
    setFolder(newFolder);
    await fetch("/api/collection/update", {
      method: "POST",
      body: JSON.stringify({ id: item.id, folder: newFolder }),
    });
  }

  return (
    <input
      type="text"
      value={folder}
      onChange={(e) => update(e.target.value)}
      className="w-28 bg-white/10 rounded px-2"
    />
  );
}

export function CostInput({ item }: { item: CollectionItem }) {
  const [cost, setCost] = useState<string | number>(
    item.cost_cents ? item.cost_cents / 100 : ""
  );

  async function update(val: string) {
    setCost(val);
    await fetch("/api/collection/update", {
      method: "POST",
      body: JSON.stringify({
        id: item.id,
        cost_cents: val ? Math.round(Number(val) * 100) : null,
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
      className="w-24 bg-white/10 rounded px-2"
    />
  );
}

export function RemoveButton({ id }: { id: string }) {
  async function remove() {
    if (!confirm("Remove item from collection?")) return;

    await fetch("/api/collection/delete", {
      method: "POST",
      body: JSON.stringify({ id }),
    });

    location.reload();
  }

  return (
    <button onClick={remove} className="text-red-400 hover:underline">
      Remove
    </button>
  );
}
