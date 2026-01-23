// src/components/admin/ai/IntegrityNotes.tsx
"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";

type Props = {
  notes?: unknown;
  title?: string;
};

function asNotesArray(notes: unknown): string[] {
  if (!Array.isArray(notes)) return [];
  return notes.map((n) => String(n ?? "").trim()).filter(Boolean);
}

export default function IntegrityNotes({ notes, title = "Sanitizer notes" }: Props) {
  const items = asNotesArray(notes);
  if (items.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-xs font-semibold opacity-90">{title}</div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs opacity-90">
        {items.map((n, i) => (
          <li key={`${i}-${n}`}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

