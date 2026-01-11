// src/app/checkout/success/page.tsx
import "server-only";

import Link from "next/link";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema/orders";
import { eq } from "drizzle-orm";
import GoogleCustomerReviewsOptIn from "./GoogleCustomerReviewsOptIn";

export const dynamic = "force-dynamic";

function fmtMoney(cents: number, currency: string) {
  const cur = (currency || "usd").toUpperCase();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur,
  }).format((Number(cents || 0) / 100));
}

function yyyyMmDd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function pickCountryCode(order: any): string {
  // Drizzle model uses camelCase fields based on your schema
  const ship = order?.shippingAddress;
  const bill = order?.billingAddress;

  // Stripe-ish address JSON commonly has `country` (ISO 2-letter)
  const shipCountry =
    ship?.country ||
    ship?.country_code ||
    ship?.countryCode ||
    ship?.address?.country ||
    ship?.address?.country_code;

  const billCountry =
    bill?.country ||
    bill?.country_code ||
    bill?.countryCode ||
    bill?.address?.country ||
    bill?.address?.country_code;

  const c = String(shipCountry || billCountry || "US").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : "US";
}

type Props = {
  searchParams?: { session_id?: string; sid?: string };
};

export default async function CheckoutSuccessPage({ searchParams }: Props) {
  // ✅ accept either param name (session_id preferred)
  const sessionId = searchParams?.session_id || searchParams?.sid;

  if (!sessionId) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-[900px] px-4 py-10">
          <h1 className="text-3xl font-extrabold text-white">Missing session</h1>
          <p className="mt-3 text-white/80">We didn’t get a Stripe session id.</p>
          <div className="mt-6 flex gap-3">
            <Link
              href="/cart"
              className="rounded-lg border border-white/30 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Back to cart
            </Link>
            <Link
              href="/store"
              className="rounded-lg border border-white/40 bg-indigo-600/80 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
            >
              Shop
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Order may take a moment to appear if webhook is still processing
  const o = await db
    .select()
    .from(orders)
    .where(eq(orders.stripeSessionId, sessionId))
    .limit(1);

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
  const currency = String(order.currency ?? "usd");

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));

  // --- Google Customer Reviews values ---
  const merchantId = process.env.GCR_MERCHANT_ID || "";
  const orderId = String(order.id);
  const email = String(order.email ?? "");
  const deliveryCountry = pickCountryCode(order);

  // Estimated delivery date: best-effort placeholder (+7 days)
  const created = new Date(order.createdAt);
  const est = new Date(created);
  est.setDate(est.getDate() + 7);
  const estimatedDeliveryDate = yyyyMmDd(est);

  const showGcr =
    merchantId.length > 0 &&
    orderId.length > 0 &&
    email.length > 0 &&
    deliveryCountry.length === 2 &&
    estimatedDeliveryDate.length === 10;

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
                <li
                  key={it.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white line-clamp-2">
                        {it.title}
                      </div>
                      <div className="mt-1 text-xs text-white/70">
                        {fmtMoney(it.unitPriceCents ?? 0, currency)} × {it.qty ?? 1}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {fmtMoney(it.lineTotalCents ?? 0, currency)}
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
                <span className="font-semibold text-white">
                  {fmtMoney(order.subtotalCents ?? 0, currency)}
                </span>
              </div>

              <div className="flex items-center justify-between text-white/70">
                <span>Shipping</span>
                <span>{fmtMoney(order.shippingCents ?? 0, currency)}</span>
              </div>

              <div className="flex items-center justify-between text-white/70">
                <span>Tax</span>
                <span>{fmtMoney(order.taxCents ?? 0, currency)}</span>
              </div>

              <div className="border-t border-white/15 pt-3 flex items-center justify-between">
                <span className="text-white/85">Total</span>
                <span className="text-lg font-extrabold text-white">
                  {fmtMoney(order.totalCents ?? 0, currency)}
                </span>
              </div>

              <div className="pt-3 text-xs text-white/60">
                Status:{" "}
                <span className="text-white/80">
                  {String(order.status).toUpperCase()}
                </span>
              </div>
            </div>

            {/* ✅ Google Customer Reviews Opt-in (don’t obscure it) */}
            {showGcr ? (
              <div className="mt-6">
                <GoogleCustomerReviewsOptIn
                  merchantId={merchantId}
                  orderId={orderId}
                  email={email}
                  deliveryCountry={deliveryCountry}
                  estimatedDeliveryDate={estimatedDeliveryDate}
                  optInStyle="CENTER_DIALOG"
                />
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}
