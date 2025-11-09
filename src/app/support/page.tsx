// src/app/support/page.tsx
import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";            // <-- use next/headers
import { Email } from "@/lib/email";
import { supportReceiptTemplate, supportStaffTemplate } from "@/emails/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function genTicketId() {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `LC-${stamp}-${rand}`;
}

async function sendSupport(formData: FormData) {
  "use server";

  const name    = (formData.get("name")    || "").toString().trim().slice(0, 120);
  const email   = (formData.get("email")   || "").toString().trim().slice(0, 200);
  const subject = (formData.get("subject") || "").toString().trim().slice(0, 200);
  const message = (formData.get("message") || "").toString().trim().slice(0, 8000);
  const honey   = (formData.get("website") || "").toString(); // honeypot

  const errs: Record<string, string> = {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = "Valid email required";
  if (!subject) errs.subject = "Subject is required";
  if (!message) errs.message = "Message is required";
  if (honey) errs.form = "Spam detected";
  if (Object.keys(errs).length) {
    const qs = new URLSearchParams({ error: "1" });
    return redirect(`/support?${qs.toString()}`);
  }

  // Optional light rate limit
  if (process.env.ENABLE_SUPPORT_RATE_LIMIT === "true" && process.env.SAVE_SUPPORT_TO_DB === "true") {
    try {
      const { db } = await import("@/lib/db");
      const { sql } = await import("drizzle-orm");
      const windowSec = Number(process.env.SUPPORT_RATE_WINDOW_SEC || "45");
      const recent = await db.execute(sql`
        select 1
        from public.support_messages
        where email = ${email}
          and created_at > now() - (make_interval(secs => ${windowSec}))
        limit 1
      `);
      if (Array.isArray(recent?.rows) && recent.rows.length) {
        const qs = new URLSearchParams({ tooFast: "1" });
        return redirect(`/support?${qs.toString()}`);
      }
    } catch {}
  }

// ✅ await headers() in your Next version
  const h = await headers();
  const ip =
    h.get("cf-connecting-ip") ||
    (h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined) ||
    h.get("x-real-ip") ||
    undefined;
  const ua = h.get("user-agent") || undefined;

  const ticketId = genTicketId();

  // Staff notification
  const staffMail = supportStaffTemplate({
    ticketId, name, fromEmail: email, subject, message, ip, userAgent: ua,
  });
  await Email.support({
    to: staffMail.to!,
    subject: staffMail.subject,
    html: staffMail.html,
    text: staffMail.text,
    replyTo: email,
    headers: { "X-Ticket-ID": ticketId },
  });

  // Customer auto-reply
  if (process.env.SUPPORT_AUTOREPLY !== "false") {
    const receipt = supportReceiptTemplate({ ticketId, name, subject, message });
    await Email.support({
      to: email,
      subject: receipt.subject,
      html: receipt.html,
      text: receipt.text,
      headers: {
        "X-Ticket-ID": ticketId,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
  }

  // Optional DB save
  if (process.env.SAVE_SUPPORT_TO_DB === "true") {
    try {
      const { db } = await import("@/lib/db");
      const { sql } = await import("drizzle-orm");
      await db.execute(sql`
        insert into public.support_messages
          (ticket_id, name, email, subject, message, ip, user_agent)
        values
          (${ticketId}, ${name || null}, ${email}, ${subject}, ${message}, ${ip || null}, ${ua || null})
      `);
    } catch (e) {
      console.warn("[support] db save failed:", (e as Error).message);
    }
  }

  redirect(`/support/sent?ticket=${encodeURIComponent(ticketId)}`);
}

export default function SupportPage() {
  return (
    <section className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-white">Contact Support</h1>
      <p className="mt-2 text-white/80">
        Questions about an order, pricing, or a specific card? Send us a message and we’ll get back within one business day.
      </p>

      <form action={sendSupport} className="mt-8 grid gap-4" autoComplete="on">
        {/* honeypot */}
        <input type="text" name="website" className="hidden" tabIndex={-1} autoComplete="off" />

        <div className="grid gap-1">
          <label htmlFor="name" className="text-sm text-white/80">Name (optional)</label>
          <input id="name" name="name" className="rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white" />
        </div>

        <div className="grid gap-1">
          <label htmlFor="email" className="text-sm text-white/80">Email</label>
          <input id="email" name="email" type="email" required className="rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white" />
        </div>

        <div className="grid gap-1">
          <label htmlFor="subject" className="text-sm text-white/80">Subject</label>
          <input id="subject" name="subject" required className="rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white" />
        </div>

        <div className="grid gap-1">
          <label htmlFor="message" className="text-sm text-white/80">Message</label>
          <textarea id="message" name="message" required rows={8} className="rounded-md bg-white/5 border border-white/10 px-3 py-2 text-white" />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-white/60">You’ll get a confirmation with your ticket ID.</div>
          <button className="inline-flex items-center rounded-md bg-sky-600 hover:bg-sky-500 px-4 py-2 font-medium text-white">
            Send to Support
          </button>
        </div>
      </form>
    </section>
  );
}
