import "server-only";
import Link from "next/link";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema/orders";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((cents || 0) / 100);

type Props = {
  searchParams?: { session_id?: string };
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  const sessionId = searchParams?.session_id;

  if (!sessionId) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-[900px] px-4 py-10">
          <h1 className="text-3xl font-extrabold text-white">Missing session</h1>
          <p className="mt-3 text-white/80">We didn’t get a Stripe session id.</p>
          <div className="mt-6 flex gap-3">
            <Link href="/cart" className="rounded-lg border border-white/30 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
              Back to cart
            </Link>
            <Link href="/store" className="rounded-lg border border-white/40 bg-indigo-600/80 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600">
              Shop
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Order may take a moment to appear if webhook is still processing
  const o = await db.select().from(orders).where(eq(orders.stripeSessionId, sessionId)).limit(1);

  if (!o.length) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-[900px] px-4 py-10">
          <h1 className="text-3xl font-extrabold text-white">Payment received ✅</h1>
          <p className="mt-3 text-white/80">
            We’re finalizing your order. If this page doesn’t update in a few seconds, hit refresh.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={`/checkout/success?session_id=${encodeURIComponent(sessionId)}`}
              className="rounded-lg border border-white/40 bg-indigo-600/80 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
            >
              Refresh
            </a>
            <Link
              href="/store"
              className="rounded-lg border border-white/30 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Continue shopping
            </Link>
          </div>

          <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-5 text-sm text-white/70">
            <div className="font-semibold text-white/85">Session</div>
            <div className="mt-1 break-all">{sessionId}</div>
          </div>
        </div>
      </main>
    );
  }

  const order = o[0];

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1100px] px-4 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white">Order confirmed ✅</h1>
            <p className="mt-2 text-white/80">
              Thanks! We’ve received your payment and created your order.
            </p>
            {order.email ? (
              <p className="mt-1 text-sm text-white/60">
                Receipt email: <span className="text-white/80">{order.email}</span>
              </p>
            ) : null}
          </div>

          <div className="flex gap-3">
            <Link
              href="/store"
              className="rounded-lg border border-white/40 bg-indigo-600/80 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
            >
              Keep shopping
            </Link>
            <Link
              href="/cart"
              className="rounded-lg border border-white/30 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              View cart
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          {/* Items */}
          <section className="rounded-2xl border border-white/15 bg-white/5 p-5">
            <h2 className="text-lg font-bold text-white">Items</h2>

            <ul className="mt-4 space-y-3">
              {items.map((it) => (
                <li key={it.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white line-clamp-2">{it.title}</div>
                      <div className="mt-1 text-xs text-white/70">
                        {fmtUSD(it.unitPriceCents)} × {it.qty}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {fmtUSD(it.lineTotalCents)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Summary */}
          <aside className="rounded-2xl border border-white/15 bg-white/5 p-5 h-fit">
            <h2 className="text-lg font-bold text-white">Order Summary</h2>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between text-white/85">
                <span>Subtotal</span>
                <span className="font-semibold text-white">{fmtUSD(order.subtotalCents)}</span>
              </div>

              <div className="flex items-center justify-between text-white/70">
                <span>Shipping</span>
                <span>{fmtUSD(order.shippingCents)}</span>
              </div>

              <div className="flex items-center justify-between text-white/70">
                <span>Tax</span>
                <span>{fmtUSD(order.taxCents)}</span>
              </div>

              <div className="border-t border-white/15 pt-3 flex items-center justify-between">
                <span className="text-white/85">Total</span>
                <span className="text-lg font-extrabold text-white">{fmtUSD(order.totalCents)}</span>
              </div>

              <div className="pt-3 text-xs text-white/60">
                Status: <span className="text-white/80">{String(order.status).toUpperCase()}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
