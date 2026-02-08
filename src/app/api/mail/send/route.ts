// src/app/api/mail/send/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: "support" | "admin";
  replyTo?: string | string[];
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function htmlToText(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function getResend() {
  const apiKey = s(process.env.RESEND_API_KEY);
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  return new Resend(apiKey);
}

function getFrom(kind: "support" | "admin") {
  const support = s(process.env.RESEND_FROM_SUPPORT);
  const admin = s(process.env.RESEND_FROM_ADMIN);

  if (!support) throw new Error("Missing RESEND_FROM_SUPPORT");
  if (!admin) throw new Error("Missing RESEND_FROM_ADMIN");

  return kind === "admin" ? admin : support;
}

export async function POST(req: NextRequest) {
  try {
    const resend = getResend();

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;

    const subject = s(body?.subject);
    const html = body?.html ?? undefined;
    const text = body?.text ?? htmlToText(html);

    if (!body?.to || !subject || (!html && !text)) {
      return NextResponse.json(
        { error: "Missing to/subject/body" },
        { status: 400 }
      );
    }

    const fromKind = body.from === "admin" ? "admin" : "support";
    const from = getFrom(fromKind);

    const to = Array.isArray(body.to)
      ? body.to.map(s).filter(Boolean)
      : [s(body.to)].filter(Boolean);

    if (to.length === 0) {
      return NextResponse.json({ error: "Invalid to" }, { status: 400 });
    }

    const replyTo = body.replyTo
      ? Array.isArray(body.replyTo)
        ? body.replyTo.map(s).filter(Boolean)
        : s(body.replyTo)
      : undefined;

    const payload: Parameters<typeof resend.emails.send>[0] = {
      from,
      to,
      subject,
      html,
      text: text ?? "",
      replyTo, // ✅ camelCase for SDK
    };

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      return NextResponse.json({ error: String(error) }, { status: 502 });
    }

    return NextResponse.json({ id: data?.id ?? null }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "send failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
