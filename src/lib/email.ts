// src/lib/email.ts
import "server-only";

/**
 * Minimal Resend email helper (HTTP API; Worker-safe).
 * - Picks "support" or "admin" from env by keyword.
 * - Retries on 429/5xx with exponential backoff.
 * - Nice defaults, but lets you override headers/reply-to/attachments.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_SUPPORT = process.env.RESEND_FROM_SUPPORT || "support@legendary-collectibles.com";
const FROM_ADMIN   = process.env.RESEND_FROM_ADMIN   || "admin@legendary-collectibles.com";

const RESEND_URL = "https://api.resend.com/emails";

export type EmailParams = {
  to: string | string[];
  subject: string;
  html?: string;                 // provide html OR text (or both)
  text?: string;
  from?: "support" | "admin" | string; // default "support"
  replyTo?: string | string[];
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string; path?: string }[];
  idempotencyKey?: string;
};

// Payload shape for Resend HTTP API
type ResendHttpPayload = {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string | string[];
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string; path?: string }[];
};

type ResendHttpResponse = {
  id?: string;
  data?: { id?: string };
  error?: unknown;
  message?: string;
};

function pickFrom(from?: EmailParams["from"]) {
  if (!from || from === "support") return FROM_SUPPORT;
  if (from === "admin") return FROM_ADMIN;
  return from; // allow explicit custom From
}

function asArray<T>(v: T | T[] | undefined): T[] | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v : [v];
}

function uuid(): string {
  // Works in Node 18+/Workers

  const rr: string | undefined = globalThis?.crypto?.randomUUID?.();
  return rr ?? `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function postToResend(
  body: ResendHttpPayload,
  idempotencyKey?: string,
  attempt = 0
): Promise<ResendHttpResponse> {
  if (!RESEND_API_KEY) {
    // "Dry run" mode when key is missing: log & pretend success.
    console.warn("[EmailService] RESEND_API_KEY missing – dry-run email:", JSON.stringify(body, null, 2));
    return { id: `dry_${uuid()}` };
  }

  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });

  // Retry on 429/5xx
  if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
    const max = 5;
    if (attempt < max) {
      const wait = Math.min(60000, 1000 * 2 ** attempt);
      console.warn(
        `[EmailService] Resend ${res.status} – retry ${attempt + 1}/${max} in ${Math.round(wait / 1000)}s`
      );
      await new Promise((r) => setTimeout(r, wait));
      return postToResend(body, idempotencyKey, attempt + 1);
    }
  }

  const json = await safeJson<ResendHttpResponse>(res);
  if (!res.ok) {
    const msg = (json && (json.message as string)) || `${res.status} ${res.statusText}`;
    throw new Error(`[EmailService] Resend error: ${msg}`);
  }
  return json ?? {};
}

export async function sendEmail(params: EmailParams): Promise<{ id: string }> {
  if (!params.to) throw new Error("sendEmail: 'to' is required");
  if (!params.subject) throw new Error("sendEmail: 'subject' is required");
  if (!params.html && !params.text) throw new Error("sendEmail: 'html' or 'text' is required");

  const enabled = (process.env.EMAIL_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabled) {
    const dryId = `dry_${Date.now().toString(36)}`;
    console.warn(
      "[EmailService] EMAIL_ENABLED=false – dry-run email:",
      JSON.stringify({ to: params.to, subject: params.subject })
    );
    return { id: dryId }; // keep return type { id: string }
  }

  const payload: ResendHttpPayload = {
    from: pickFrom(params.from),
    to: asArray(params.to) ?? [],
    subject: params.subject,
    html: params.html,
    text: params.text,
    reply_to: asArray(params.replyTo),
    headers: params.headers,
    attachments: params.attachments,
  };

  const result = await postToResend(payload, params.idempotencyKey || uuid());
  const id =
    (typeof result.id === "string" && result.id) ||
    (typeof result.data?.id === "string" && result.data.id) ||
    uuid();

  return { id };
}

/* Convenience wrappers */
export const Email = {
  /** Generic send (choose from: "support" | "admin" | custom string) */
  send: sendEmail,

  /** Force "support" From */
  support: (p: Omit<EmailParams, "from"> & { from?: never }) => sendEmail({ ...p, from: "support" }),

  /** Force "admin" From */
  admin: (p: Omit<EmailParams, "from"> & { from?: never }) => sendEmail({ ...p, from: "admin" }),

  /** Simple HTML helper for transactional emails */
  renderHtml: (title: string, body: string) => `
    <!doctype html>
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;margin:0;padding:24px;background:#f7f7f7;}
          .card{max-width:640px;margin:auto;background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden}
          .hdr{padding:16px 20px;background:#111;color:#fff;font-weight:600}
          .cnt{padding:20px;line-height:1.55}
          .ftr{padding:16px 20px;color:#666;font-size:12px;border-top:1px solid #f0f0f0}
          a{color:#2563eb}
        </style>
      </head>
      <body>
        <div class="card">
          <div class="hdr">Legendary Collectibles</div>
          <div class="cnt">${body}</div>
          <div class="ftr">You’re receiving this message from legendary-collectibles.com</div>
        </div>
      </body>
    </html>
  `,
};

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
