import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type TcgdexRow = {
  id: string;
  raw_json: any;
};

export type TcgdexSetRow = {
  id: string;
  raw_json: any;
};

export type LegacyRow = {
  id: string;
  name: string | null;
  set_id: string | null;
  set_name: string | null;
  rarity: string | null;
  number: string | null;
  small_image: string | null;
  large_image: string | null;
};

export type VariantRow = {
  normal: boolean | null;
  reverse: boolean | null;
  holo: boolean | null;
  first_edition: boolean | null;
  w_promo: boolean | null;
};

export type CardSource = "tcgdex" | "legacy";

export type CardResolved = {
  source: CardSource;
  id: string;
  name: string;
  setId: string | null;
  setName: string | null;
  rarity: string | null;
  number: string | null;
  cover: string | null;
  thumb: string | null;
  raw: any | null;
  legacyId?: string | null;
};

export type LatestSnapshotRow = {
  card_id: string;
  currency: "USD" | "EUR";
  market_price_cents: number;
  as_of_date: string;
  updated_at: string;
};

export type SnapshotRow = {
  card_id: string;
  as_of_date: string;
  currency: string;
  market_price_cents: number;
  updated_at: string;
};

export type SnapshotBundle = {
  usd: LatestSnapshotRow | null;
  eur: LatestSnapshotRow | null;
  latestDate: string | null;
  latestUpdatedAt: string | null;
};

export function s(v: unknown) {
  return String(v ?? "").trim();
}

export function normText(v: unknown) {
  return String(v ?? "").trim();
}

export function normalizeLocalIdLikeTcgdex(v: unknown) {
  const str = normText(v);
  if (!str) return "";

  const m = str.match(/^0*(\d+)/);
  if (m && m[1]) {
    return m[1].replace(/^0+(?=\d)/, "") || "0";
  }

  if (/^\d+$/.test(str)) {
    return str.replace(/^0+(?=\d)/, "") || "0";
  }

  return str;
}

export function tcgdexCardImage(
  base: string | null | undefined,
  quality: "high" | "low",
  ext: "webp" | "png" | "jpg"
) {
  const b = s(base);
  if (!b) return null;
  return `${b.replace(/\/+$/, "")}/${quality}.${ext}`;
}

export function bestImageFromTcgdexRaw(raw: any): string | null {
  return (
    tcgdexCardImage(raw?.image, "high", "webp") ||
    tcgdexCardImage(raw?.image, "high", "png") ||
    null
  );
}

export function thumbImageFromTcgdexRaw(raw: any): string | null {
  return (
    tcgdexCardImage(raw?.image, "low", "webp") ||
    tcgdexCardImage(raw?.image, "low", "png") ||
    bestImageFromTcgdexRaw(raw)
  );
}

export function withExtIfMissing(u: string, ext: "png" | "webp" | "jpg" = "png") {
  const str = String(u ?? "").trim();
  if (!str) return null;

  if (/\.(png|webp|jpg|jpeg)$/i.test(str)) return str;
  if (/\/(logo|symbol)$/i.test(str)) return `${str}.${ext}`;

  return str;
}

export function extractTcgdexSetAssets(rawSet: any): { logo: string | null; symbol: string | null } {
  const logoBase = rawSet?.logo ? String(rawSet.logo).trim() : "";
  const symbolBase = rawSet?.symbol ? String(rawSet.symbol).trim() : "";

  return {
    logo: logoBase ? withExtIfMissing(logoBase, "png") : null,
    symbol: symbolBase ? withExtIfMissing(symbolBase, "png") : null,
  };
}

export function dedupeText(values: Array<string | null | undefined>) {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

export function formatDateLabel(value: string | null | undefined) {
  if (!value) return null;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function groupSnapshotRowsByCurrency(rows: SnapshotRow[]) {
  const byCurrency = new Map<string, SnapshotRow[]>();

  for (const row of rows) {
    const cur = s(row.currency).toUpperCase();
    if (!byCurrency.has(cur)) byCurrency.set(cur, []);
    byCurrency.get(cur)!.push(row);
  }

  for (const list of byCurrency.values()) {
    list.sort((a, b) => {
      const aa = `${a.as_of_date}|${a.updated_at}`;
      const bb = `${b.as_of_date}|${b.updated_at}`;
      return aa.localeCompare(bb);
    });
  }

  return byCurrency;
}

export async function getTcgdexCard(cardId: string): Promise<TcgdexRow | null> {
  return (
    (
      await db.execute<TcgdexRow>(sql`
        SELECT id::text AS id, raw_json
        FROM public.tcgdex_cards
        WHERE id::text = ${cardId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

export async function getTcgdexSet(setId: string): Promise<TcgdexSetRow | null> {
  if (!setId) return null;

  return (
    (
      await db.execute<TcgdexSetRow>(sql`
        SELECT id::text AS id, raw_json
        FROM public.tcgdex_sets
        WHERE id::text = ${setId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

export async function getLegacyCard(cardId: string): Promise<LegacyRow | null> {
  return (
    (
      await db.execute<LegacyRow>(sql`
        SELECT
          c.id::text AS id,
          NULLIF(c.name,'') AS name,
          NULLIF(c.set_id,'') AS set_id,
          NULLIF(s.name,'') AS set_name,
          NULLIF(c.rarity,'') AS rarity,
          NULLIF(c.number,'') AS number,
          NULLIF(c.small_image,'') AS small_image,
          NULLIF(c.large_image,'') AS large_image
        FROM public.tcg_cards c
        LEFT JOIN public.tcg_sets s
          ON s.id = c.set_id
        WHERE c.id::text = ${cardId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

export async function getLegacyVariants(cardId: string): Promise<VariantRow | null> {
  return (
    (
      await db.execute<VariantRow>(sql`
        SELECT
          v.normal AS normal,
          v.reverse AS reverse,
          v.holo AS holo,
          v.first_edition AS first_edition,
          v.w_promo AS w_promo
        FROM public.tcg_card_variants v
        WHERE v.card_id::text = ${cardId}::text
        LIMIT 1
      `)
    ).rows?.[0] ?? null
  );
}

export async function findTcgdexByLegacyHints(legacy: LegacyRow): Promise<TcgdexRow | null> {
  const setName = normText(legacy.set_name);
  const name = normText(legacy.name);
  const legacyNum = normalizeLocalIdLikeTcgdex(legacy.number);

  if (!legacyNum) return null;

  if (setName) {
    const rowA =
      (
        await db.execute<TcgdexRow>(sql`
          SELECT id::text AS id, raw_json
          FROM public.tcgdex_cards
          WHERE (raw_json->'set'->>'name') ILIKE ${setName}
            AND regexp_replace(COALESCE(raw_json->>'localId',''), '^0+(?=\\d)', '') =
                regexp_replace(${legacyNum}::text, '^0+(?=\\d)', '')
            AND (
              ${name}::text = ''
              OR (raw_json->>'name') ILIKE ${name}
            )
          LIMIT 1
        `)
      ).rows?.[0] ?? null;

    if (rowA) return rowA;
  }

  if (name) {
    const rowB =
      (
        await db.execute<TcgdexRow>(sql`
          SELECT id::text AS id, raw_json
          FROM public.tcgdex_cards
          WHERE (raw_json->>'name') ILIKE ${name}
            AND regexp_replace(COALESCE(raw_json->>'localId',''), '^0+(?=\\d)', '') =
                regexp_replace(${legacyNum}::text, '^0+(?=\\d)', '')
          LIMIT 1
        `)
      ).rows?.[0] ?? null;

    if (rowB) return rowB;
  }

  return null;
}

export async function resolvePokemonCard(cardIdRaw: string): Promise<CardResolved | null> {
  const cardId = decodeURIComponent(String(cardIdRaw ?? "")).trim();
  if (!cardId) return null;

  const tcgdex = await getTcgdexCard(cardId);
  if (tcgdex) {
    const raw = tcgdex.raw_json ?? {};
    const id = String(raw?.id ?? tcgdex.id).trim() || tcgdex.id;
    const name = String(raw?.name ?? id).trim() || id;
    const setId = String(raw?.set?.id ?? "").trim() || null;
    const setName = String(raw?.set?.name ?? "").trim() || null;
    const rarity = String(raw?.rarity ?? "").trim() || null;
    const number = raw?.localId != null ? String(raw.localId) : null;

    const cover = bestImageFromTcgdexRaw(raw);
    const thumb = thumbImageFromTcgdexRaw(raw) ?? cover;

    return {
      source: "tcgdex",
      id,
      name,
      setId,
      setName,
      rarity,
      number,
      cover,
      thumb,
      raw,
    };
  }

  const legacy = await getLegacyCard(cardId);
  if (!legacy) return null;

  const tcgdexViaLegacy = await findTcgdexByLegacyHints(legacy);
  if (tcgdexViaLegacy) {
    const raw = tcgdexViaLegacy.raw_json ?? {};
    const id = String(raw?.id ?? tcgdexViaLegacy.id).trim() || tcgdexViaLegacy.id;
    const name = String(raw?.name ?? id).trim() || id;
    const setId = String(raw?.set?.id ?? "").trim() || null;
    const setName = String(raw?.set?.name ?? "").trim() || null;
    const rarity = String(raw?.rarity ?? "").trim() || null;
    const number = raw?.localId != null ? String(raw.localId) : null;

    const cover = bestImageFromTcgdexRaw(raw);
    const thumb = thumbImageFromTcgdexRaw(raw) ?? cover;

    return {
      source: "tcgdex",
      id,
      name,
      setId,
      setName,
      rarity,
      number,
      cover,
      thumb,
      raw,
      legacyId: legacy.id,
    };
  }

  const id = legacy.id;
  const name = String(legacy.name ?? id).trim() || id;
  const cover = legacy.large_image || legacy.small_image || null;
  const thumb = legacy.small_image || legacy.large_image || null;

  const raw = {
    id,
    name,
    rarity: legacy.rarity ?? undefined,
    number: legacy.number ?? undefined,
    set: legacy.set_id ? { id: legacy.set_id, name: legacy.set_name ?? undefined } : undefined,
    image: undefined,
    pricing: undefined,
  };

  return {
    source: "legacy",
    id,
    name,
    setId: legacy.set_id,
    setName: legacy.set_name,
    rarity: legacy.rarity,
    number: legacy.number,
    cover,
    thumb,
    raw,
    legacyId: legacy.id,
  };
}

export async function getLatestDailySnapshots(
  cardIds: Array<string | null | undefined>
): Promise<SnapshotBundle> {
  const ids = dedupeText(cardIds);
  if (!ids.length) {
    return {
      usd: null,
      eur: null,
      latestDate: null,
      latestUpdatedAt: null,
    };
  }

  const predicates = ids.map((id) => sql`card_id::text = ${id}::text`);
  const whereCardId = sql.join(predicates, sql` OR `);

  const rows =
    (
      await db.execute<LatestSnapshotRow>(sql`
        SELECT DISTINCT ON (currency)
          card_id::text AS card_id,
          currency::text AS currency,
          market_price_cents::int AS market_price_cents,
          as_of_date::text AS as_of_date,
          updated_at::text AS updated_at
        FROM public.tcgdex_price_snapshots_daily
        WHERE (${whereCardId})
          AND currency::text IN ('USD', 'EUR')
          AND market_price_cents IS NOT NULL
          AND market_price_cents > 0
        ORDER BY currency, as_of_date DESC, updated_at DESC
      `)
    ).rows ?? [];

  let usd: LatestSnapshotRow | null = null;
  let eur: LatestSnapshotRow | null = null;
  let latestDate: string | null = null;
  let latestUpdatedAt: string | null = null;

  for (const row of rows) {
    const curr = String(row.currency).toUpperCase();
    if (curr === "USD" && !usd) usd = { ...row, currency: "USD" };
    if (curr === "EUR" && !eur) eur = { ...row, currency: "EUR" };

    if (!latestDate || String(row.as_of_date) > latestDate) latestDate = String(row.as_of_date);
    if (!latestUpdatedAt || String(row.updated_at) > latestUpdatedAt) latestUpdatedAt = String(row.updated_at);
  }

  return { usd, eur, latestDate, latestUpdatedAt };
}

export async function getDailySnapshotHistory(
  cardIds: Array<string | null | undefined>,
  days = 180
): Promise<SnapshotRow[]> {
  const ids = dedupeText(cardIds);
  const d = Math.max(1, Math.min(3650, Number(days) || 180));

  if (!ids.length) return [];

  const predicates = ids.map((id) => sql`card_id::text = ${id}::text`);
  const whereCardIds = sql.join(predicates, sql` OR `);

  return (
    (
      await db.execute<SnapshotRow>(sql`
        SELECT
          card_id::text AS card_id,
          as_of_date::text AS as_of_date,
          currency::text AS currency,
          market_price_cents::int AS market_price_cents,
          updated_at::text AS updated_at
        FROM public.tcgdex_price_snapshots_daily
        WHERE (${whereCardIds})
          AND as_of_date >= (CURRENT_DATE - (${d}::int))
          AND market_price_cents IS NOT NULL
          AND market_price_cents > 0
        ORDER BY as_of_date ASC, updated_at ASC
      `)
    ).rows ?? []
  );
}
