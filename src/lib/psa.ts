// src/lib/psa.ts
import "server-only";

const PSA_API_BASE = process.env.PSA_API_BASE || "https://api.psacard.com/publicapi";
const PSA_USER = process.env.PSA_API_USERNAME || "";
const PSA_PASS = process.env.PSA_API_PASSWORD || "";

// In-memory token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

function mustEnv(name: string, val: string) {
  if (!val) throw new Error(`Missing env ${name}`);
}

async function getAccessToken(): Promise<string> {
  mustEnv("PSA_API_USERNAME", PSA_USER);
  mustEnv("PSA_API_PASSWORD", PSA_PASS);

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 30_000 > now) {
    return cachedToken.token;
  }

  // PSA docs say OAuth2 password grant, but their swagger page is JS-only.
  // So we implement a configurable token endpoint with sensible defaults.
  // If it fails, we’ll log the response so you can confirm the exact path.
  const tokenUrlCandidates = [
    `${PSA_API_BASE}/token`,
    `${PSA_API_BASE}/oauth/token`,
    `${PSA_API_BASE}/connect/token`,
  ];

  let lastErr: any = null;

  for (const tokenUrl of tokenUrlCandidates) {
    try {
      const body = new URLSearchParams();
      body.set("grant_type", "password");
      body.set("username", PSA_USER);
      body.set("password", PSA_PASS);

      const resp = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      const text = await resp.text();
      if (!resp.ok) {
        lastErr = new Error(`Token request failed ${resp.status} at ${tokenUrl}: ${text.slice(0, 300)}`);
        continue;
      }

      const json = JSON.parse(text);
      const token = json.access_token || json.accessToken || json.token;
      const expiresIn = Number(json.expires_in || json.expiresIn || 3600);

      if (!token) throw new Error(`Token response missing access_token at ${tokenUrl}`);

      cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
      return token;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Failed to acquire PSA token");
}

export async function psaGetByCertNumber(certNumberRaw: string) {
  const certNumber = String(certNumberRaw || "").trim();
  if (!certNumber) return { ok: false, error: "Missing cert number" };

  const token = await getAccessToken();

  // PSA docs explicitly show this cert endpoint
  // https://api.psacard.com/publicapi/cert/GetByCertNumber/00000000 :contentReference[oaicite:3]{index=3}
  const url = `${PSA_API_BASE}/cert/GetByCertNumber/${encodeURIComponent(certNumber)}`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `bearer ${token}`,
      Accept: "application/json",
    },
  });

  const data = await resp.json().catch(() => null);

  // PSA docs mention: IsValidRequest + ServerMessage fields in body :contentReference[oaicite:4]{index=4}
  return {
    ok: resp.ok,
    status: resp.status,
    data,
  };
}
