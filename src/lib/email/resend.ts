// src/lib/email/resend.ts
import "server-only";

type SendEmailArgs = {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
};

export async function sendEmailResend(args: SendEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY || "";
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(args.idempotencyKey ? { "Idempotency-Key": args.idempotencyKey } : {}),
    },
    body: JSON.stringify({
      to: args.to,
      from: args.from,
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      (data && (data.error?.message || data.message)) ||
      `Resend send failed (${res.status})`;
    throw new Error(msg);
  }

  return data;
}
