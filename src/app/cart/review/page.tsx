// src/app/cart/review/page.tsx
import "server-only";

import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { baseShippingCentsForWeight } from "@/lib/shipping/rates";
import { insuranceCentsForShipment } from "@/lib/shipping/insurance";
import CheckoutButton from "@/app/cart/CheckoutButton";
import CheckoutWithEmail from "./CheckoutWithEmail";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CART_COOKIE = "lc_cart_id";

function money(cents: number): string {
  const v = (Number(cents || 0) / 100).toFixed(2);
  return `$${v}`;
}
function toNumber(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toInt(v: unknown, fallback = 0): number {
  const n = Math.floor(toNumber(v));
  return Number.isFinite(n) ? n : fallback;
}
function s(v: unknown) {
  return String(v ?? "").trim();
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

export default async function CartReviewPage() {
  // Optional auth (guest allowed)
  let userId: string | null = null;
  try {
    const a = await auth();
    userId = a?.userId || null;
  } catch {
    userId = null;
  }

  const jar = await cookies();
  const cookieCartId = s(jar.get(CART_COOKIE)?.value);

  // Keep review math consistent with /api/checkout/sessions
  const FREE_SHIPPING_THRESHOLD_CENTS = Math.max(
    0,
    toInt(process.env.FREE_SHIPPING_THRESHOLD_CENTS, 15000),
  );

  // Determine cartId (cookie first; fallback to signed-in user's open cart)
  let cartId = "";
  if (cookieCartId && isUuid(cookieCartId)) {
    cartId = cookieCartId;
  } else if (userId) {
    const cartRes = await db.execute(sql`
      SELECT id
      FROM carts
      WHERE user_id = ${userId}
        AND coalesce(status, 'open') = 'open'
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `);
    cartId = (cartRes as any)?.rows?.[0]?.id ? String((cartRes as any).rows[0].id) : "";
  }

  if (!cartId || !isUuid(cartId)) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Review your order</h1>
        <p className="mt-3 text-sm opacity-80">
          Your cart is empty.
        </p>
        <div className="mt-6 flex gap-3">
          <Link className="underline" href="/shop">
            Continue shopping
          </Link>
          <Link className="underline" href="/cart">
            Go to cart
          </Link>
        </div>
      </main>
    );
  }

  // Pull cart lines with product + first image
  const linesRes = await db.execute(sql`
    WITH first_image AS (
      SELECT DISTINCT ON (pi.product_id)
        pi.product_id,
        pi.url
      FROM product_images pi
      ORDER BY pi.product_id, pi.sort ASC, pi.created_at ASC
    )
    SELECT
      cl.id AS line_id,
      cl.qty,
      p.id AS product_id,
      p.slug,
      p.title,
      p.game,
      p.format,
      p.price_cents,
      p.quantity AS product_quantity,
      p.status AS product_status,
      p.shipping_weight_lbs,
      p.shipping_class,
      fi.url AS image_url
    FROM cart_lines cl
    JOIN products p ON p.id = cl.listing_id
    LEFT JOIN first_image fi ON fi.product_id = p.id
    WHERE cl.cart_id = ${cartId}::uuid
      AND cl.listing_id IS NOT NULL
      AND p.status = 'active'::product_status
      AND p.quantity > 0
    ORDER BY cl.created_at ASC
  `);

  const rows: any[] = (linesRes as any)?.rows ?? [];

  if (!rows.length) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Review your order</h1>
        <p className="mt-3 text-sm opacity-80">Your cart is empty.</p>
        <div className="mt-6 flex gap-3">
          <Link className="underline" href="/shop">
            Continue shopping
          </Link>
          <Link className="underline" href="/cart">
            Go to cart
          </Link>
        </div>
      </main>
    );
  }

  // Totals
  let subtotalCents = 0;
  let totalWeight = 0;

  const insuranceItems: Array<{ shippingClass?: string | null; qty?: number | null }> = [];

  for (const r of rows) {
    const qty = Math.max(1, toInt(r.qty, 1));
    const priceCents = toInt(r.price_cents, 0);

    subtotalCents += priceCents * qty;

    const shippingClass = r.shipping_class ? String(r.shipping_class) : null;
    const w = toNumber(r.shipping_weight_lbs);

    const fallbackW =
      String(shippingClass || "").toLowerCase() === "graded"
        ? 0.5
        : String(shippingClass || "").toLowerCase() === "etb"
          ? 2.0
          : String(shippingClass || "").toLowerCase() === "booster_box"
            ? 3.0
            : String(shippingClass || "").toLowerCase() === "accessory"
              ? 0.5
              : 0.25;

    totalWeight += (w > 0 ? w : fallbackW) * qty;

    insuranceItems.push({ shippingClass, qty });
  }

  const freeShipping = subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS;

  const baseShippingCents = freeShipping ? 0 : baseShippingCentsForWeight(totalWeight);
  const insuranceCents = insuranceCentsForShipment(insuranceItems);
  const shippingTotalCents = baseShippingCents + insuranceCents;

  const taxCents = 0;
  const estimatedTotalCents = subtotalCents + shippingTotalCents + taxCents;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Review your order</h1>
          <p className="mt-2 text-sm opacity-80">
            Shipping is estimated using weight + your USPS Ground Advantage tiers.
          </p>
          <p className="mt-1 text-xs opacity-70">Tax is calculated at checkout.</p>

          {!userId && (
            <p className="mt-3 text-sm opacity-80">
              Checking out as a guest. You’ll enter email + shipping at checkout.
              {" "}
              <Link className="underline" href="/sign-in">
                Sign in
              </Link>{" "}
              if you want this order tied to your account.
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <Link className="underline" href="/cart">
            Edit cart
          </Link>
          <Link className="underline" href="/shop">
            Continue shopping
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Items */}
        <section className="lg:col-span-2">
          <h2 className="text-lg font-semibold">Items</h2>

          <div className="mt-4 divide-y rounded-lg border">
            {rows.map((r) => {
              const qty = Math.max(1, toInt(r.qty, 1));
              const priceCents = toInt(r.price_cents, 0);
              const lineTotal = priceCents * qty;

              return (
                <div key={String(r.line_id)} className="flex gap-4 p-4">
                  <div className="h-20 w-20 overflow-hidden rounded bg-black/5">
                    {r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={String(r.image_url)}
                        alt={String(r.title || "Product image")}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{String(r.title)}</div>
                        <div className="mt-1 text-xs opacity-70">
                          {String(r.game)} • {String(r.format)}
                          {r.shipping_class ? ` • ${String(r.shipping_class)}` : ""}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm">{money(lineTotal)}</div>
                        <div className="mt-1 text-xs opacity-70">
                          {money(priceCents)} × {qty}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-xs opacity-70">
                      Weight:{" "}
                      {r.shipping_weight_lbs ? `${Number(r.shipping_weight_lbs)} lb` : "default"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Summary */}
        <aside className="rounded-lg border p-5">
          <h2 className="text-lg font-semibold">Order summary</h2>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{money(subtotalCents)}</span>
            </div>

            <div className="flex justify-between">
              <span>Shipping</span>
              <span>{freeShipping ? "$0.00" : money(baseShippingCents)}</span>
            </div>

            <div className="flex justify-between">
              <span>Insurance</span>
              <span>{insuranceCents ? money(insuranceCents) : "$0.00"}</span>
            </div>

            <div className="flex justify-between">
              <span>Final tax and shipping confirmed at checkout</span>
              <span>{money(taxCents)}</span>
            </div>

            <div className="my-3 flex justify-between border-t pt-3 font-semibold">
              <span>Estimated total</span>
              <span>{money(estimatedTotalCents)}</span>
            </div>

            {freeShipping && (
              <div className="text-xs opacity-70">
                Free shipping applied (subtotal ≥ {money(FREE_SHIPPING_THRESHOLD_CENTS)}).
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-2">
  <CheckoutWithEmail />

  {insuranceCents > 0 && (
    <div className="text-xs opacity-70">
      Insurance is automatically added for graded cards.
    </div>
  )}
</div>

        </aside>
      </div>
    </main>
  );
}
