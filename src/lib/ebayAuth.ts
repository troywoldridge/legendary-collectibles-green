// src/lib/ebayAuth.ts
import "server-only";

type Cached = { token: string; exp: number };
declare global {
  // eslint-disable-next-line no-var
  var __EBAY_TOKEN_CACHE__: Cached | undefined;
}

// Cache ~85 minutes (eBay tokens are 120 min)
const TTL_MS = 85 * 60 * 1000;

export async function getEbayAppToken(): Promise<string> {
  const id = process.env.EBAY_CLIENT_ID?.trim();
  const sec = process.env.EBAY_CLIENT_SECRET?.trim();
  if (!id || !sec) throw new Error("Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET");

  const now = Date.now();
  if (global.__EBAY_TOKEN_CACHE__ && global.__EBAY_TOKEN_CACHE__.exp > now + 10_000) {
    return global.__EBAY_TOKEN_CACHE__!.token;
  }

  const auth = Buffer.from(`${id}:${sec}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body:
      "grant_type=client_credentials&scope=" +
      encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
    cache: "no-store",
  });

  const j = await res.json();
  if (!res.ok || !j.access_token) {
    throw new Error(`eBay token error ${res.status}: ${JSON.stringify(j)}`);
  }

  global.__EBAY_TOKEN_CACHE__ = { token: j.access_token as string, exp: now + TTL_MS };
  return j.access_token as string;
}
