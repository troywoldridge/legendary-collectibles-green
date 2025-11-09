// src/app/api/webhooks/stripe/route.ts
import "server-only";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { billingCustomers, userPlans } from "@/lib/db/schema/billing";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});
const secret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.arrayBuffer();
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(Buffer.from(raw), sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // On first purchase, persist customer → user
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const userId = (s.metadata?.userId as string) || null;
    const plan = (s.metadata?.plan as "collector" | "pro" | undefined) || "collector";
    const stripeCustomerId = typeof s.customer === "string" ? s.customer : s.customer?.id || null;

    if (userId && stripeCustomerId) {
      await db
        .insert(billingCustomers)
        .values({ userId, stripeCustomerId })
        .onConflictDoUpdate({
          target: billingCustomers.userId,
          set: { stripeCustomerId },
        });

      await db
        .insert(userPlans)
        .values({ userId, planId: plan })
        .onConflictDoUpdate({ target: userPlans.userId, set: { planId: plan } });
    }
  }

  // Optional: handle subscription updates/cancellations to downgrade plan
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const cust = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (cust) {
      const rows = await db.select().from(billingCustomers).where(eq(billingCustomers.stripeCustomerId, cust));
      const u = rows[0];
      if (u) {
        await db
          .insert(userPlans)
          .values({ userId: u.userId, planId: "free" })
          .onConflictDoUpdate({ target: userPlans.userId, set: { planId: "free" } });
      }
    }
  }

  return NextResponse.json({ received: true });
}
