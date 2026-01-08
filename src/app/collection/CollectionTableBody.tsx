// src/app/collection/CollectionTableBody.tsx
import "server-only";

import Link from "next/link";
import Image from "next/image";
import MarketValueInline from "@/components/market/MarketValueInline";

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

  is_verified: boolean | null;
  verified_at: string | null;

  quantity: number | null;
  folder: string | null;

  cost_cents: number | null;
  last_value_cents: number | null;

  created_at: string | null;
};

export type MVRow = {
  as_of_date: string;
  card_key: string;
  grade: string;
  market_value_usd: number | null;
  range_low_usd: number | null;
  range_high_usd: number | null;
  last_sale_usd: number | null;
  last_sale_at: string | null;
  sales_count_180d: number | null;
  confidence: string | null;
};

export type MVMap = Map<string, { today: MVRow | null; yesterday: MVRow | null }>;

function moneyFromCents(cents: number | null | undefined) {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function gameToCardUrl(game: string, cardId: string) {
  const g = String(game).toLowerCase();
  if (g === "pokemon") return `/categories/pokemon/cards/${encodeURIComponent(cardId)}`;
  if (g === "mtg" || g === "magic") return `/categories/mtg/cards/${encodeURIComponent(cardId)}`;
  if (g === "yugioh" || g === "ygo") return `/categories/yugioh/cards/${encodeURIComponent(cardId)}`;
  return `/categories/pokemon/cards/${encodeURIComponent(cardId)}`;
}

function normalizeGameKey(game: string | null) {
  const g = String(game ?? "").toLowerCase();
  if (g === "magic") return "mtg";
  if (g === "ygo") return "yugioh";
  return g || "other";
}

export default function CollectionTableBody(props: {
  items: CollectionItem[];
  planTier: "free" | "collector" | "pro";
  mvMap: MVMap;
}) {
  const { items, planTier, mvMap } = props;

  return (
    <tbody className="divide-y divide-white/10">
      {items.map((r) => {
        const qty = r.quantity ?? 0;
        const totalValueCents =
          (r.last_value_cents ?? 0) > 0 ? (r.last_value_cents ?? 0) * qty : null;

        const g = normalizeGameKey(r.game);
        const id = String(r.card_id ?? "").trim();

        const source = g === "mtg" ? "scryfall" : "card";
        const cardKey = id ? `${g}|${source}|${id}` : "";

        const grade =
          r.grade_label && String(r.grade_label).trim()
            ? String(r.grade_label).trim()
            : "Ungraded";

        const mv = cardKey ? mvMap.get(`${cardKey}||${grade}`) : null;

        const href = r.card_id ? gameToCardUrl(r.game ?? "", r.card_id) : null;

        return (
          <tr key={r.id} className="align-top">
            {/* Photo */}
            <td className="p-2">
              <div className="relative h-16 w-12 overflow-hidden rounded border border-white/20 bg-black/30">
                {r.image_url ? (
                  <Image
                    src={r.image_url}
                    alt={r.card_name ?? "Card"}
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

            {/* Item */}
            <td className="p-2">
              <div className="space-y-1">
                <div className="font-medium text-white">
                  {href ? (
                    <Link href={href} className="hover:underline" prefetch={false}>
                      {r.card_name ?? r.card_id ?? "Unknown"}
                    </Link>
                  ) : (
                    <span>{r.card_name ?? r.card_id ?? "Unknown"}</span>
                  )}
                </div>
                <div className="text-xs text-white/60">
                  {r.set_name ?? "—"} {r.folder ? <>• {r.folder}</> : null}
                </div>
              </div>
            </td>

            {/* Grade */}
            <td className="p-2">
              <div className="text-sm text-white">{grade}</div>
              {r.grading_company ? (
                <div className="mt-1 text-xs text-white/60">{r.grading_company}</div>
              ) : null}
              {r.cert_number ? (
                <div className="mt-1 text-xs text-white/50">Cert: {r.cert_number}</div>
              ) : null}
            </td>

            {/* Qty */}
            <td className="p-2">
              <div className="text-sm text-white">{qty}</div>
            </td>

            {/* Folder */}
            <td className="p-2">
              <div className="text-sm text-white">{r.folder ?? "—"}</div>
            </td>

            {/* Cost */}
            <td className="p-2">
              <div className="text-sm text-white">{moneyFromCents(r.cost_cents)}</div>
              {qty > 1 && (r.cost_cents ?? 0) > 0 ? (
                <div className="mt-1 text-xs text-white/60">
                  {qty}× {moneyFromCents(r.cost_cents)}
                </div>
              ) : null}
            </td>

            {/* Total Value */}
            <td className="p-2">
              <div className="text-sm text-white">{moneyFromCents(totalValueCents)}</div>

              {/* Compact market inline */}
              {mv?.today ? (
                <MarketValueInline
                  plan={planTier}
                  today={mv.today}
                  yesterday={mv.yesterday ?? null}
                />
              ) : (
                <div className="mt-2 text-xs text-white/50">Market: —</div>
              )}
            </td>

            {/* Actions */}
            <td className="p-2">
              {href ? (
                <Link
                  href={href}
                  className="inline-block rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
                  prefetch={false}
                >
                  View
                </Link>
              ) : (
                <span className="text-xs text-white/50">—</span>
              )}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}
