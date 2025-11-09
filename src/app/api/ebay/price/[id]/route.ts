import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

/** Returned fragment we care about from Browse */
type EbayFoundItem = {
  title?: string | null;
  itemId?: string | null;
  itemWebUrl?: string | null;
  price?: { value: string; currency: string } | null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const OAUTH_URL  = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

/** Simple cache so we don’t fetch a token every request */
let tokenCache:
  | { accessToken: string; expiresAt: number }  // epoch seconds
  | null = null;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

async function getToken(): Promise<string> {
  // return cached token if fresh
  if (tokenCache && tokenCache.expiresAt > nowSec() + 30) {
    return tokenCache.accessToken;
  }

  const id = process.env.EBAY_CLIENT_ID?.trim();
  const secret = process.env.EBAY_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw new Error("EBAY_CLIENT_ID/EBAY_CLIENT_SECRET missing");
  }
  const auth = Buffer.from(`${id}:${secret}`).toString("base64");

  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body:
      "grant_type=client_credentials&scope=" +
      encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
  });

  const j: any = await res.json();
  if (!res.ok || !j?.access_token) {
    throw new Error(`eBay token error ${res.status}: ${JSON.stringify(j)}`);
  }

  const ttl = Number(j.expires_in ?? 7200);
  tokenCache = {
    accessToken: j.access_token as string,
    expiresAt: nowSec() + Math.max(60, ttl - 60),
  };
  return tokenCache.accessToken;
}

/** Build a few candidate queries: most specific → loosest */
function buildQueriesForMtg(
  name: string,
  setCode?: string | null,
  setName?: string | null,
  num?: string | null
) {
  const sc = (setCode || "").toUpperCase();
  const nn = (num || "").replace(/^0+/, "");
  const base = (name || "").replace(/\s+/g, " ").trim();
  const qs: string[] = [];
  if (base && sc && nn) qs.push(`"${base}" ${sc} ${nn} MTG`);
  if (base && setName && nn) qs.push(`"${base}" ${setName} ${nn} MTG`);
  if (base && sc) qs.push(`"${base}" ${sc} MTG`);
  if (base && setName) qs.push(`"${base}" ${setName} MTG`);
  if (base) qs.push(`"${base}" MTG`);
  return qs;
}

async function browseOne(q: string, token: string, marketplace: string) {
  const url = new URL(BROWSE_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "1");
  // You can tune further if needed:
  // url.searchParams.set("filter", "priceCurrency:USD"); // forces USD results

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": marketplace,
    },
  });

  if (!res.ok) {
    // don’t throw — just return null so caller can try next query
    return null;
  }
  const j: any = await res.json();
  const it = j?.itemSummaries?.[0];
  if (!it) return null;

  const item: EbayFoundItem = {
    title: it.title ?? null,
    itemId: it.itemId ?? null,
    itemWebUrl: it.itemWebUrl ?? null,
    price: it.price ?? null,
  };
  return item;
}

function isUuidLike(s: string) {
  // accepts dashed or undashed 32 hex
  return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(s);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const url = new URL(req.url);

    const fromHeaderMarketplace =
      req.headers.get("x-ebay-c-marketplace-id")?.trim() || "";
    const marketplace =
      fromHeaderMarketplace ||
      process.env.EBAY_MARKETPLACE?.trim() ||
      "EBAY_US";

    const qOverride = url.searchParams.get("q")?.trim() || "";
    const persist = url.searchParams.get("persist") === "1";

    // Optional: protect DB writes with a simple shared secret
    if (persist) {
      const expected = (process.env.CRON_SECRET || "").trim();
      const provided = (req.headers.get("x-cron-key") || "").trim();
      if (!expected || provided !== expected) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const token = await getToken();

    // If caller gave ?q=, just run it and (optionally) persist against path :id
    let tried = "";
    let found: EbayFoundItem | null = null;
    let scryfallIdForPersist: string | null = null;

    if (qOverride) {
      tried = qOverride;
      found = await browseOne(tried, token, marketplace);
      scryfallIdForPersist = isUuidLike(id) ? id : null;
    } else {
      // Resolve the card & assemble queries
      const rawId = id;
      const idNoDashes = rawId.replace(/-/g, "");

      const probe = await db.execute<{ id: string; name: string | null; set_code: string | null; set_name: string | null; collector_number: string | null }>(
        sql`
          SELECT
            c.id::text AS id,
            c.name,
            c.set_code,
            c.set_name,
            c.collector_number
          FROM public.mtg_cards c
          WHERE c.id::text = ${rawId}
             OR REPLACE(c.id::text,'-','') = ${idNoDashes}
          LIMIT 1
        `
      );
      const row = probe.rows?.[0] ?? null;
      if (!row) {
        // fallback: still allow a blind search by id to be helpful
        tried = rawId;
        found = await browseOne(tried, token, marketplace);
        scryfallIdForPersist = isUuidLike(rawId) ? rawId : null;
      } else {
        const qs = buildQueriesForMtg(
          row.name ?? "",
          row.set_code,
          row.set_name,
          row.collector_number
        );
        scryfallIdForPersist = row.id;
        for (const q of qs) {
          tried = q;
          // eslint-disable-next-line no-await-in-loop
          const candidate = await browseOne(q, token, marketplace);
          if (candidate) {
            found = candidate;
            break;
          }
        }
      }
    }

    // Persist snapshot if asked & we have enough to be useful
    let persisted = false;
    if (
      persist &&
      scryfallIdForPersist &&
      found &&
      found.price?.value &&
      found.price?.currency
    ) {
      try {
        await db.execute(sql`
          INSERT INTO public.ebay_price_snapshots
            (game, scryfall_id, q, title, item_id, url, price, currency, raw, fetched_at)
          VALUES
            ('mtg', ${scryfallIdForPersist}, ${tried || null},
             ${found.title ?? null}, ${found.itemId ?? null}, ${found.itemWebUrl ?? null},
             ${found.price.value}, ${found.price.currency}, ${JSON.stringify(found)}, NOW())
        `);
        persisted = true;
      } catch (e) {
        // don’t fail the response if insert blows up
        console.error("[ebay persist failed]", e);
      }
    }

    return NextResponse.json(
      { ok: true, q: tried, item: found, persisted },
      { status: 200 }
    );
  } catch (err: any) {
    // Keep non-authorization errors at 200 so the cron can continue
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 200 }
    );
  }
}
