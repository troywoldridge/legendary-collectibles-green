// src/app/api/mail/send/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM_SUPPORT = process.env.RESEND_FROM_SUPPORT!;
const FROM_ADMIN = process.env.RESEND_FROM_ADMIN!;

type Body = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: "support" | "admin";
  replyTo?: string | string[]; // allow array here too
};

function htmlToText(html?: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    if (!body?.to || !body?.subject || (!body.html && !body.text)) {
      return NextResponse.json({ error: "Missing to/subject/body" }, { status: 400 });
    }

    const from = body.from === "admin" ? FROM_ADMIN : FROM_SUPPORT;
    const to = Array.isArray(body.to) ? body.to : [body.to];
    const text = body.text ?? htmlToText(body.html);

    // Use the actual installed SDK parameter type to avoid version drift:
    const payload: Parameters<typeof resend.emails.send>[0] = {
      from,
      to,
      subject: body.subject,
      html: body.html,
      text,                 // always provide a string
      replyTo: body.replyTo // ✅ camelCase for the SDK
      // headers, cc, bcc, attachments etc. can be added here if you need
      // headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
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
