/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import React from "react";
import { centsToUsd } from "@/lib/pricecharting";

type Props = {
  category: "pokemon" | "mtg" | "yugioh";
  snapshot: {
    loose_cents: number | null;
    graded_cents: number | null;
    cib_cents: number | null;
    new_cents: number | null;
    box_only_cents: number | null;
    manual_only_cents: number | null;
    bgs10_cents: number | null;
    cgc10_cents: number | null;
    sgc10_cents: number | null;
    captured_at: string | null;
  } | null;
};

/**
 * This replaces the entire old PriceChartingGrades component.
 * It expects the parent page to pass in the snapshot data
 * already loaded from the database.
 */
export default function PriceChartingGradesDB({ category, snapshot }: Props) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/15 p-5 text-white">
      <h2 className="text-lg font-semibold mb-3">PriceCharting Grades</h2>

      {!snapshot ? (
        <div className="text-white/70 text-sm">
          No PriceCharting snapshot available for this card.
        </div>
      ) : (
        <div className="grid sm:grid-cols-3 grid-cols-2 gap-3 text-sm">
          <GradeRow label="Loose (Ungraded)" value={snapshot.loose_cents} />
          <GradeRow label="Graded 9" value={snapshot.graded_cents} />
          <GradeRow label="CIB" value={snapshot.cib_cents} />
          <GradeRow label="New" value={snapshot.new_cents} />
          <GradeRow label="Box Only" value={snapshot.box_only_cents} />
          <GradeRow label="PSA 10" value={snapshot.manual_only_cents} />
          <GradeRow label="BGS 10" value={snapshot.bgs10_cents} />
          <GradeRow label="CGC 10" value={snapshot.cgc10_cents} />
          <GradeRow label="SGC 10" value={snapshot.sgc10_cents} />

          <div className="rounded-md bg-white/5 border border-white/10 p-3 col-span-full">
            <div className="text-xs text-white/60">Snapshot Date</div>
            <div className="text-white font-semibold">
              {snapshot.captured_at
                ? new Date(snapshot.captured_at).toLocaleDateString()
                : "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GradeRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md bg-white/5 border border-white/10 p-3">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-white font-semibold">
        {value == null ? "—" : centsToUsd(value)}
      </div>
    </div>
  );
}
