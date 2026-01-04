// src/app/collection/CollectionTableBody.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import CardSparkline from "@/components/collection/CardSparkline";

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

  // ✅ PSA verification fields (new)
  is_verified: boolean | null;
  verified_at: string | null;

  quantity: number | null;
  folder: string | null;
  cost_cents: number | null;
  last_value_cents: number | null;
  created_at: string | null;
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

function formatMoneyFromCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatGameLabel(game: string | null | undefined): string {
  switch (game) {
    case "pokemon":
      return "Pokémon";
    case "mtg":
    case "magic":
      return "Magic: The Gathering";
    case "yugioh":
    case "ygo":
      return "Yu-Gi-Oh!";
    default:
      return "Other / Unknown";
  }
}

// Detail URL per game
function detailHrefFor(game: string | null, cardId: string | null): string | null {
  if (!cardId) return null;

  switch (game) {
    case "pokemon":
      return `/categories/pokemon/cards/${encodeURIComponent(cardId)}`;
    case "ygo":
    case "yugioh":
      return `/categories/yugioh/cards/${encodeURIComponent(cardId)}`;
    case "mtg":
    case "magic":
      return `/categories/mtg/cards/${encodeURIComponent(cardId)}`;
    default:
      return null;
  }
}

// Price history URL per game
function priceHistoryHrefFor(game: string | null, cardId: string | null): string | null {
  if (!cardId) return null;

  switch (game) {
    case "pokemon":
      return `/categories/pokemon/cards/${encodeURIComponent(cardId)}/prices`;
    case "mtg":
    case "magic":
      return `/categories/mtg/cards/${encodeURIComponent(cardId)}/prices`;
    case "ygo":
    case "yugioh":
      return `/categories/yugioh/cards/${encodeURIComponent(cardId)}/prices`;
    default:
      return null;
  }
}

export default function CollectionTableBody({ items }: Props) {
  if (!items.length) {
    return (
      <tbody>
        <tr>
          <td colSpan={8} className="p-6 text-center text-sm text-white/70">
            No items found.
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

function CollectionRow({ item }: { item: CollectionItem }) {
  const detailHref = detailHrefFor(item.game, item.card_id);
  const priceHref = priceHistoryHrefFor(item.game, item.card_id);

  // compute total value (price × qty) once
  const qty = item.quantity ?? 1;
  const perCopy = item.last_value_cents ?? null;
  const totalValueCents = perCopy != null ? perCopy * qty : null;

  return (
    <tr className="border-b border-white/10 hover:bg-white/5">
      {/* Photo */}
      <td className="p-2">
        <div className="relative h-16 w-12 overflow-hidden rounded border border-white/20 bg-black/40">
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

      {/* Item info + links */}
      <td className="p-2 align-top">
        <div className="text-sm font-semibold">
          {detailHref ? (
            <Link href={detailHref} className="hover:text-sky-300 hover:underline">
              {item.card_name ?? item.card_id ?? "Unknown card"}
            </Link>
          ) : (
            item.card_name ?? item.card_id ?? "Unknown card"
          )}
        </div>
        <div className="text-xs text-white/60">
          {item.set_name ?? "—"} • {formatGameLabel(item.game)}
        </div>
        {priceHref && (
          <div className="mt-1 text-[11px]">
            <Link href={priceHref} className="text-sky-300 hover:underline">
              Price history
            </Link>
          </div>
        )}
      </td>

      {/* Grade dropdown + PSA verify */}
      <td className="p-2 align-top">
        <div className="space-y-2">
          <GradeSelect item={item} />
          <PsaVerifyInline item={item} />
        </div>
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

      {/* Total value + sparkline */}
      <td className="p-2 align-top text-sm">
        <div className="font-semibold text-blue-300">{formatMoneyFromCents(totalValueCents)}</div>
        <div className="mt-1 h-6">
          {item.card_id ? <CardSparkline game={item.game ?? "pokemon"} cardId={item.card_id} /> : null}
        </div>
      </td>

      {/* Actions */}
      <td className="p-2 align-top space-y-1 text-sm">
        {detailHref && (
          <Link href={detailHref} className="block text-sky-300 hover:underline">
            View
          </Link>
        )}
        <Link href={`/collection/edit/${item.id}`} className="block text-sky-300 hover:underline">
          Edit
        </Link>
        <RemoveButton id={item.id} />
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------------------------
   PSA Inline Verify UI
------------------------------------------------------------------------------------ */

function PsaVerifyInline({ item }: { item: CollectionItem }) {
  const initialIsVerified = !!item.is_verified;
  const [isVerified, setIsVerified] = useState<boolean>(initialIsVerified);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const grader = (item.grading_company || "").trim().toUpperCase();
  const cert = (item.cert_number || "").trim();

  const isPsa = grader === "PSA";
  const canVerify = isPsa && cert.length > 0 && !isVerified;

  // Keep label compact
  const statusLabel = useMemo(() => {
    if (!isPsa) return null;
    if (!cert) return "Add cert # to verify";
    return isVerified ? "Verified" : "Not verified";
  }, [isPsa, cert, isVerified]);

  if (!isPsa) return null;

  async function verify() {
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/psa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Verification failed");
      }

      // Convention: your route should return { ok, verified, ... }
      if (json?.verified) {
        setIsVerified(true);
        setMsg("Verified ✅");
      } else {
        setIsVerified(false);
        setMsg(json?.message || "PSA could not verify this cert.");
      }
    } catch (e: any) {
      setMsg(e?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="psaInline">
      <div className="psaInlineRow">
        <span className="psaChip">PSA</span>
        {item.grade_label ? <span className="psaGrade">{item.grade_label}</span> : null}
        {cert ? <span className="psaCert">Cert {cert}</span> : <span className="psaCert psaCertMissing">No cert #</span>}
        {statusLabel ? (
          <span className={isVerified ? "psaStatus psaStatusOk" : "psaStatus psaStatusNo"}>
            {statusLabel}
          </span>
        ) : null}
      </div>

      {canVerify ? (
        <button type="button" className="psaBtn" onClick={verify} disabled={loading}>
          {loading ? "Verifying..." : "Verify"}
        </button>
      ) : null}

      {msg ? <div className="psaMsg">{msg}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------
   CLIENT CONTROLS (Grade dropdown / qty / folder / cost / remove)
------------------------------------------------------------------------------------ */

function GradeSelect({ item }: { item: CollectionItem }) {
  const initialCompany: GradeCompany = (item.grading_company as GradeCompany | null) ?? "UNGR";
  const initialGrade = item.grade_label ?? GRADE_OPTIONS[initialCompany]?.[0] ?? "Ungraded";

  const [company, setCompany] = useState<GradeCompany>(initialCompany);
  const [grade, setGrade] = useState<string>(initialGrade);

  const grades = GRADE_OPTIONS[company];

  async function update(nextCompany: GradeCompany, nextGrade: string) {
    setCompany(nextCompany);
    setGrade(nextGrade);

    await fetch("/api/collection/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        grading_company: nextCompany,
        grade_label: nextGrade,
      }),
    });
  }

  return (
    <div className="flex gap-2">
      <select
        value={company}
        onChange={(e) => {
          const next = (e.target.value || "UNGR") as GradeCompany;
          const firstGrade = GRADE_OPTIONS[next][0];
          update(next, firstGrade);
        }}
        className="rounded bg-white/10 p-1 text-xs"
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
          await fetch("/api/collection/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: item.id,
              grading_company: company,
              grade_label: nextGrade,
            }),
          });
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

function QtyInput({ item }: { item: CollectionItem }) {
  const [qty, setQty] = useState<number>(item.quantity ?? 1);

  async function update(newQty: number) {
    setQty(newQty);

    await fetch("/api/collection/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
        const n = Math.max(1, Number(e.target.value) || 1);
        update(n);
      }}
      className="w-16 rounded bg-white/10 px-2 py-1 text-sm"
    />
  );
}

function FolderInput({ item }: { item: CollectionItem }) {
  const [folder, setFolder] = useState<string>(item.folder ?? "");

  async function update(newFolder: string) {
    setFolder(newFolder);

    await fetch("/api/collection/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      className="w-28 rounded bg-white/10 px-2 py-1 text-sm"
    />
  );
}

function CostInput({ item }: { item: CollectionItem }) {
  const initialCost = item.cost_cents != null ? item.cost_cents / 100 : "";
  const [cost, setCost] = useState<string | number>(initialCost);

  async function update(val: string) {
    setCost(val);

    const n = val.trim() === "" ? null : Math.round(Number(val) * 100);

    await fetch("/api/collection/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        cost_cents: n,
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
      className="w-24 rounded bg-white/10 px-2 py-1 text-sm"
    />
  );
}

function RemoveButton({ id }: { id: string }) {
  async function remove() {
    if (!confirm("Remove item from collection?")) return;

    await fetch("/api/collection/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    window.location.reload();
  }

  return (
    <button type="button" onClick={remove} className="text-red-400 hover:underline">
      Remove
    </button>
  );
}
