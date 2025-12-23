// src/app/api/checkout/buy-now/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema/shop";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-10-29.clover",
});

export async function POST(req: Request) {
  try {
    const { productId, quantity } = await req.json();
    const qty = Math.max(1, Math.min(99, Number(quantity) || 1));

    const row = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!row.length) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const p = row[0];

    if (p.status !== "active") return NextResponse.json({ error: "Not available" }, { status: 400 });
    if (Number(p.quantity ?? 0) < qty) return NextResponse.json({ error: "Out of stock" }, { status: 400 });

    const origin = req.headers.get("origin") || "https://legendary-collectibles.com";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${origin}/cart?success=1`,
      cancel_url: `${origin}/products/${p.id}`,

      // ✅ Make webhook life easy:
      metadata: {
        source: "buy_now",
        productId: String(p.id),
        quantity: String(qty),
      },

      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: "usd",
            unit_amount: Number(p.priceCents),
            product_data: {
              name: p.title,
              // ✅ Also include metadata here (handy if you expand line items later)
              metadata: {
                productId: String(p.id),
              },
            },
          },
        },
      ],
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err) {
    console.error("[api/checkout/buy-now] error", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
