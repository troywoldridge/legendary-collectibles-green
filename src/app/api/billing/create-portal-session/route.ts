// src/app/api/billing/create-portal-session/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { billingCustomers } from "@/lib/db/schema/billing";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Use the exact union your stripe typings expect
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-10-29.clover",
});

export async function POST(_req: NextRequest) {
  const { userId } = await auth(); // await fixes the TS error
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Avoid db.query.* so it works even if the billing schema isn't re-exported in the barrel
  const row = await db
    .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
    .from(billingCustomers)
    .where(eq(billingCustomers.userId, userId))
    .limit(1);

  const customerId = row[0]?.stripeCustomerId;
  if (!customerId) {
    return NextResponse.json({ error: "No billing customer" }, { status: 400 });
  }

  // Safe return URL (dev/prod)
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3001");

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${base}/collections`,
  });

  return NextResponse.json({ url: session.url });
}
