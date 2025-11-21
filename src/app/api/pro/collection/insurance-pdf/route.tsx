/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserPlan } from "@/lib/plans";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------- Types ---------- */
type ItemRow = {
  id: string;
  game: string | null;
  card_id: string | null;
  set_name: string | null;
  number: string | null;
  qty: number | null;
};

type YgoPriceRow = { card_id: string; price: number | null };
type PtcgPriceRow = { card_id: string; price: number | null };
type MtgPriceRow = { card_id: string; price: number | null };

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10 },
  h1: { fontSize: 18, marginBottom: 8 },
  h2: { fontSize: 12, marginTop: 16, marginBottom: 6 },
  row: { flexDirection: "row", borderBottom: "1px solid #ddd", paddingVertical: 4 },
  cell: { flexGrow: 1 },
  cellSmall: { width: 60 },
  totalRow: { marginTop: 8, paddingTop: 8, borderTop: "1px solid #000", flexDirection: "row" },
  totalLabel: { flexGrow: 1, fontSize: 12 },
  totalValue: { width: 120, fontSize: 12, textAlign: "right" },
});

/* ---------- Helpers ---------- */
async function streamToUint8Array(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

   
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // src/app/api/pro/alerts/route.ts

  const plan = await getUserPlan(userId);

  // Use maxItemsTotal here, not maxItems
  const maxItemsTotal = plan?.limits?.maxItemsTotal ?? 0;

  if (maxItemsTotal <= 0) {
    return NextResponse.json({ error: "Pro required" }, { status: 402 });
  }


  // --- Collection items
  const itemsRes = await db.execute<ItemRow>(sql`
    SELECT id, game, card_id, set_name, number, qty
    FROM collection_items
    WHERE user_id = ${userId}
    ORDER BY game, set_name, number
  `);
  const items = (itemsRes.rows ?? []) as ItemRow[];

  // --- Build ID lists per game (non-null only)
  const ygoIds = items.filter(i => i.game === "yugioh"  && i.card_id).map(i => i.card_id!) as string[];
  const ptcgIds = items.filter(i => i.game === "pokemon" && i.card_id).map(i => i.card_id!) as string[];
  const mtgIds = items.filter(i => i.game === "mtg"     && i.card_id).map(i => i.card_id!) as string[];

  // --- Yu-Gi-Oh! prices (tcgplayer_price)
  const ygoMap = new Map<string, number>();
  if (ygoIds.length) {
    const ygoRes = await db.execute<YgoPriceRow>(sql`
      SELECT card_id, tcgplayer_price AS price
      FROM ygo_card_prices
      WHERE card_id = ANY(${ygoIds})
    `);
    for (const r of ygoRes.rows ?? []) {
      ygoMap.set(r.card_id, Number(r.price ?? 0) || 0);
    }
  }

  // --- Pokémon prices (prefer TCGplayer markets; fallback to Cardmarket trend_price)
  const ptcgMap = new Map<string, number>();
  if (ptcgIds.length) {
    const ptcgRes = await db.execute<PtcgPriceRow>(sql`
      SELECT c.id AS card_id,
             COALESCE(
               tp.market_normal,
               tp.market_holofoil,
               tp.market_reverse_holofoil,
               tp.market_1st_holofoil,
               tp.market_1st_normal,
               cm.trend_price,
               0
             ) AS price
      FROM tcg_cards c
      LEFT JOIN tcg_card_prices_tcgplayer  tp ON tp.card_id = c.id
      LEFT JOIN tcg_card_prices_cardmarket cm ON cm.card_id = c.id
      WHERE c.id = ANY(${ptcgIds})
    `);
    for (const r of ptcgRes.rows ?? []) {
      ptcgMap.set(r.card_id, Number(r.price ?? 0) || 0);
    }
  }

  // --- MTG prices (use Scryfall proxy: mtg_card_prices.usd)
  const mtgMap = new Map<string, number>();
  if (mtgIds.length) {
    const mtgRes = await db.execute<MtgPriceRow>(sql`
      SELECT m.scryfall_id::text AS card_id,
             COALESCE(p.usd, 0)   AS price
      FROM mtg_cards m
      LEFT JOIN mtg_card_prices p ON p.scryfall_id = m.scryfall_id
      WHERE m.scryfall_id::text = ANY(${mtgIds})
    `);
    for (const r of mtgRes.rows ?? []) {
      mtgMap.set(r.card_id, Number(r.price ?? 0) || 0);
    }
  }

  // --- Compose report rows
  const reportRows = items.map(i => {
    const game = (i.game || "").toLowerCase();
    const id = i.card_id || "";
    const qty = Number(i.qty || 0);

    const unit =
      game === "yugioh"  ? (ygoMap.get(id)  || 0) :
      game === "pokemon" ? (ptcgMap.get(id) || 0) :
      game === "mtg"     ? (mtgMap.get(id)  || 0) :
      0;

    const total = unit * qty;

    return {
      id: i.id,
      game,
      set_name: i.set_name ?? "",
      card_id: id,
      qty,
      unit_value: unit,
      total_value: total,
    };
  });

  const grandTotal = reportRows.reduce((sum, r) => sum + r.total_value, 0);

  // --- PDF doc
  const Doc = (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.h1}>Collection Valuation Report</Text>
        <Text>Date: {new Date().toLocaleString()}</Text>

        <Text style={styles.h2}>Items</Text>
        {reportRows.map((r) => (
          <View key={r.id} style={styles.row}>
            <Text style={[styles.cell, { maxWidth: 160 }]}>{r.game.toUpperCase()}</Text>
            <Text style={[styles.cell, { maxWidth: 160 }]}>{r.set_name}</Text>
            <Text style={styles.cell}>{r.card_id}</Text>
            <Text style={styles.cellSmall}>x{r.qty}</Text>
            <Text style={styles.cellSmall}>${r.unit_value.toFixed(2)}</Text>
            <Text style={[styles.cellSmall, { textAlign: "right" }]}>${r.total_value.toFixed(2)}</Text>
          </View>
        ))}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Grand Total (estimated)</Text>
          <Text style={styles.totalValue}>${grandTotal.toFixed(2)}</Text>
        </View>
      </Page>
    </Document>
  );

  // --- Render PDF and normalize to a strict ArrayBuffer for Response body
  const raw: unknown = await pdf(Doc).toBuffer();

  let bytes: Uint8Array;

  if (raw instanceof Uint8Array) {
    bytes = raw;
  } else if (raw instanceof ArrayBuffer) {
    bytes = new Uint8Array(raw);
  } else if (raw && typeof (raw as any).getReader === "function") {
    // Web ReadableStream
    bytes = await streamToUint8Array(raw as ReadableStream<Uint8Array>);
  } else if (typeof Buffer !== "undefined" && (raw as any)?.type === "Buffer") {
    // Node Buffer-like object
    bytes = Buffer.from(raw as any);
  } else {
    // Last resort: coerce via Response shim
    const ab = await new Response(raw as any).arrayBuffer();
    bytes = new Uint8Array(ab);
  }

  // Create a **new** ArrayBuffer so its type is guaranteed to be `ArrayBuffer` (not SharedArrayBuffer)
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);

  return new Response(ab, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="insurance-${new Date().toISOString().slice(0,10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
