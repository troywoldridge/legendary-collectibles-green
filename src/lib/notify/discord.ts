export async function notifyDiscordSale(input: {
  orderId: string;
  totalCents: number;
  currency: string;
  itemCount: number;
  customerEmail?: string;
  needsManualReview?: boolean;
}) {
  const url = process.env.DISCORD_SALES_WEBHOOK_URL;
  if (!url) return;

  const money = `${input.currency.toUpperCase()} $${(
    input.totalCents / 100
  ).toFixed(2)}`;

  const content = [
    input.needsManualReview ? "⚠️ **MANUAL REVIEW REQUIRED**" : "💰 **NEW SALE**",
    `**Order:** ${input.orderId}`,
    `**Total:** ${money}`,
    `**Items:** ${input.itemCount}`,
    input.customerEmail ? `**Customer:** ${input.customerEmail}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}
