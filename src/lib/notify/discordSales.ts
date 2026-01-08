// src/lib/notify/discordSales.ts
import "server-only";

type Severity = "success" | "warning" | "error";

export type DiscordSaleNotifyInput = {
  severity: Severity;

  orderId?: string;
  stripeSessionId?: string;
  paymentIntentId?: string;

  currency?: string;
  totalCents?: number;
  itemCount?: number;

  customerEmail?: string;

  needsManualReview?: boolean;
  reason?: string;

  adminOrderUrl?: string;
};

function money(cents: number, currency: string) {
  const cur = (currency || "usd").toUpperCase();
  const v = (Number(cents || 0) / 100).toFixed(2);
  return `${cur} $${v}`;
}

function colorFor(sev: Severity): number {
  if (sev === "success") return 0x2ecc71; // green
  if (sev === "warning") return 0xf1c40f; // yellow
  return 0xe74c3c; // red
}

function titleFor(input: DiscordSaleNotifyInput): string {
  if (input.severity === "error") return "🔴 Stripe webhook error";
  if (input.needsManualReview || input.severity === "warning")
    return "🟡 Sale captured — manual review";
  return "🟢 New sale";
}

async function postDiscord(payload: any) {
  const url = process.env.DISCORD_SALES_WEBHOOK_URL;
  if (!url) return;

  // timeout so webhook never hangs
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
  } catch (e) {
    console.error("[discordSales] failed to post", e);
  } finally {
    clearTimeout(t);
  }
}

export async function notifyDiscordSale(input: DiscordSaleNotifyInput) {
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (input.orderId) fields.push({ name: "Order", value: input.orderId, inline: true });
  if (typeof input.itemCount === "number")
    fields.push({ name: "Items", value: String(input.itemCount), inline: true });

  if (typeof input.totalCents === "number")
    fields.push({
      name: "Total",
      value: money(input.totalCents, input.currency || "usd"),
      inline: true,
    });

  if (input.customerEmail)
    fields.push({ name: "Customer", value: input.customerEmail, inline: false });

  if (input.stripeSessionId)
    fields.push({ name: "Session", value: input.stripeSessionId, inline: false });

  if (input.paymentIntentId)
    fields.push({ name: "PaymentIntent", value: input.paymentIntentId, inline: false });

  if (input.reason)
    fields.push({ name: "Reason", value: input.reason, inline: false });

  const embed: any = {
    title: titleFor(input),
    color: colorFor(input.severity),
    fields,
    timestamp: new Date().toISOString(),
  };

  if (input.adminOrderUrl) {
    embed.url = input.adminOrderUrl; // clicking title goes to admin
  }

  await postDiscord({ embeds: [embed] });
}
