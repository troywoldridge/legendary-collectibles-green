// src/app/api/webhooks/resend/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { emailEvents } from "@/lib/db/schema/emailEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Minimal event shape we care about from Resend
type ResendEvent = {
  id?: string;
  event_id?: string;
  type?: string;
  created_at?: string;
  data?: Record<string, unknown>;
};

function sTrim(v: unknown) {
  return String(v ?? "").trim();
}

function getResend() {
  const apiKey = sTrim(process.env.RESEND_API_KEY);
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  return new Resend(apiKey);
}

function toCsv(val: unknown): string | null {
  if (Array.isArray(val)) return val.filter(Boolean).map(String).join(",");
  if (typeof val === "string") return val;
  return null;
}

const s = (v: unknown): string | null => (typeof v === "string" ? v : null);
const hdr = (h: Headers, k: string) => h.get(k) ?? "";

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = sTrim(process.env.RESEND_WEBHOOK_SECRET);
    if (!webhookSecret) {
      console.error("[resend webhook] Missing RESEND_WEBHOOK_SECRET");
      return NextResponse.json(
        { ok: false, error: "Server not configured" },
        { status: 500 }
      );
    }

    // IMPORTANT: verify against the raw body string
    let payload: string;
    try {
      payload = await req.text();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const resend = getResend();

    let verified: ResendEvent;
    try {
      // New API: headers + webhookSecret (svix)
      verified = (await resend.webhooks.verify({
        payload,
        headers: {
          id: hdr(req.headers, "svix-id"),
          timestamp: hdr(req.headers, "svix-timestamp"),
          signature: hdr(req.headers, "svix-signature"),
        },
        webhookSecret,
      })) as ResendEvent;
    } catch (err) {
      console.warn("[resend webhook] signature verify failed:", err);
      return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
    }

    // Pull the fields we care about (safely)
    const type = verified.type ?? "unknown";
    const occurredAt = verified.created_at ?? null;
    const data = (verified.data ?? {}) as Record<string, unknown>;

    const emailId = s(data["email_id"]);
    const subject = s(data["subject"]);
    const fromAddress = s(data["from"]);
    const toCsvVal = toCsv(data["to"]);
    const messageId = s(data["messageId"]) ?? s(data["message_id"]);
    const emailCreatedAt = s(data["created_at"]);

    const click = (data["click"] ?? null) as Record<string, unknown> | null;
    const clickIp = click ? s(click["ipAddress"]) : null;
    const clickLink = click ? s(click["link"]) : null;
    const clickTimestamp = click ? s(click["timestamp"]) : null;
    const clickUserAgent = click ? s(click["userAgent"]) : null;

    const errorCode = s(data["errorCode"]) ?? s(data["code"]);
    const errorMessage = s(data["errorMessage"]) ?? s(data["reason"]);

    // Stable event id
    const eventId =
      verified.id ??
      verified.event_id ??
      `${type}:${emailId ?? "unknown"}:${occurredAt ?? Date.now()}`;

    await db
      .insert(emailEvents)
      .values({
        eventId,
        eventType: type,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        emailId,
        subject,
        fromAddress,
        toCsv: toCsvVal,
        messageId,
        emailCreatedAt: emailCreatedAt ? new Date(emailCreatedAt) : null,
        clickIp,
        clickLink,
        clickTimestamp: clickTimestamp ? new Date(clickTimestamp) : null,
        clickUserAgent,
        errorCode,
        errorMessage,
        idempotencyKey: req.headers.get("idempotency-key") || null,
        raw: verified, // jsonb
      })
      .onConflictDoNothing({ target: emailEvents.eventId });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Webhook failed";
    console.error("[resend webhook] error:", err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
