import "server-only";

import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema/orders";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;

function money(cents: number | null | undefined, currency: string | null | undefined) {
  const cur = (currency || "usd").toUpperCase();
  const v = (Number(cents || 0) / 100).toFixed(2);
  return `${cur} $${v}`;
}

function isAdminEmail(email?: string | null) {
  const allow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!allow.length) return false; // force you to set it
  if (!email) return false;
  return allow.includes(email.toLowerCase());
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: { orderId: string };
}) {
  const orderId = params.orderId;

  // If coming from an email link, you’re often signed-out.
  // Redirect to sign-in and bounce back to this exact page (RELATIVE path).
  const { userId } = await auth();
  if (!userId) {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/admin/orders/${orderId}`)}`);
  }

  // Get real email from the user object (more reliable than session claims)
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ||
    user?.emailAddresses?.[0]?.emailAddress ||
    null;

  if (!isAdminEmail(email)) notFound();

  const [o] = (await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1)) as OrderRow[];

  if (!o) notFound();

  const items = (await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))) as OrderItemRow[];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Order</h1>
        <div className="mt-2 text-sm opacity-80">{o.id}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm opacity-70">Status</div>
          <div className="mt-1 text-lg font-medium">{String(o.status)}</div>

          <div className="mt-4 text-sm opacity-70">Total</div>
          <div className="mt-1 text-lg font-medium">
            {money(o.totalCents, o.currency)}
          </div>

          <div className="mt-4 text-sm opacity-70">Customer</div>
          <div className="mt-1">{o.email || "—"}</div>

          <div className="mt-4 text-sm opacity-70">Stripe</div>
          <div className="mt-1 break-all text-sm opacity-90">
            <div>Session: {o.stripeSessionId}</div>
            {o.stripePaymentIntentId ? <div>PI: {o.stripePaymentIntentId}</div> : null}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm opacity-70">Shipping</div>
          <div className="mt-1 font-medium">{o.shippingName || "—"}</div>

          <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/30 p-3 text-xs opacity-90">
{o.shippingAddress ? JSON.stringify(o.shippingAddress, null, 2) : "—"}
          </pre>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-4">
        <h2 className="text-lg font-semibold">Items</h2>

        {items.length === 0 ? (
          <div className="mt-3 text-sm opacity-70">No items found.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/30 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{it.title}</div>
                  <div className="mt-1 text-xs opacity-70">
                    Qty {it.qty} • {money(it.unitPriceCents, o.currency)}
                  </div>
                </div>

                <div className="shrink-0 font-semibold">
                  {money(it.lineTotalCents, o.currency)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 rounded-xl border border-white/10 bg-black/20 p-4">
        <h2 className="text-lg font-semibold">Raw Stripe Session</h2>
        <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/30 p-3 text-xs opacity-90">
{o.stripeSessionRaw ? JSON.stringify(o.stripeSessionRaw, null, 2) : "—"}
        </pre>
      </div>
    </div>
  );
}
