// src/app/api/stripe/checkout/sessions/[id]/expire/route.ts
import "server-only";

import { NextRequest } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Helper: validate route parameter for a Stripe Checkout Session ID.
// Stripe Checkout Session IDs typically start with "cs_" (cs_test_ or cs_live_).
// We allow letters, numbers, underscore and hyphen, and enforce a reasonable length.
function validateSessionId(id: unknown): string | { error: string } {
  if (typeof id !== "string") return { error: "Missing session id" };
  const trimmed = id.trim();
  if (!trimmed) return { error: "Session id is empty" };
  if (trimmed.length < 6 || trimmed.length > 255)
    return { error: "Session id has invalid length" };

  const allowed = /^[A-Za-z0-9_-]+$/;
  if (!allowed.test(trimmed))
    return { error: "Session id contains invalid characters" };

  if (!/^cs_/.test(trimmed))
    return {
      error:
        "Session id does not look like a Checkout Session id (missing 'cs_' prefix)",
    };

  return trimmed;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stripeNotConfigured(): Response {
  // Never leak secrets; keep this message generic.
  return json(500, { error: "Stripe is not configured on server" });
}

function isStripeMissingResource(err: any): boolean {
  return Boolean(
    err &&
      (err.statusCode === 404 ||
        err.code === "resource_missing" ||
        err.type === "StripeInvalidRequestError")
  );
}

// ✅ IMPORTANT: Match Next's expected handler signature in your error message.
// Next expects `context.params` as a Promise for this route typing.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await context.params;

    // Validate param at request time
    const validated = validateSessionId(id);
    if (typeof validated !== "string") return json(400, { error: validated.error });
    const sessionId = validated;

    // Read Stripe secret key at request time only.
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return stripeNotConfigured();

    // Initialize Stripe at request time.
    // (Avoid module-scope init so Next's build/collect step can't fail.)
    const stripe = new Stripe(stripeKey);

    // Retrieve the Checkout Session.
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (err: any) {
      if (isStripeMissingResource(err)) {
        return json(404, { error: "Checkout session not found" });
      }
      console.error("Stripe retrieve session error:", err);
      return json(500, { error: "Failed to retrieve checkout session" });
    }

    // "Expire" strategy:
    // 1) If there's a payment_intent, cancel it (prevents charge).
    // 2) If session came from a payment_link, deactivate that link (prevents new sessions).
    // 3) If subscription exists, cancel subscription.
    // If none apply, return 400.

    // 1) Cancel PaymentIntent if present
    if (session.payment_intent) {
      const piId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : (session.payment_intent as any)?.id;

      if (!piId) {
        return json(400, { error: "No cancellable payment intent found on session" });
      }

      try {
        const canceled = await stripe.paymentIntents.cancel(piId);
        return json(200, {
          success: true,
          id: sessionId,
          action: "payment_intent_canceled",
          object: "payment_intent",
          status: canceled.status ?? null,
        });
      } catch (err: any) {
        if (isStripeMissingResource(err)) {
          return json(404, { error: "Underlying payment intent not found" });
        }
        console.error("Stripe cancel PI error:", err);
        return json(500, { error: "Failed to cancel payment intent" });
      }
    }

    // 2) Deactivate Payment Link if present
    const paymentLink = (session as any).payment_link;
    if (paymentLink) {
      const plinkId =
        typeof paymentLink === "string" ? paymentLink : paymentLink?.id;

      if (!plinkId) {
        return json(400, { error: "No valid payment_link id found on session" });
      }

      try {
        const updated = await stripe.paymentLinks.update(plinkId, { active: false });
        return json(200, {
          success: true,
          id: sessionId,
          action: "payment_link_deactivated",
          payment_link: updated.id,
          active: updated.active === false,
        });
      } catch (err: any) {
        if (isStripeMissingResource(err)) {
          return json(404, { error: "Payment link not found" });
        }
        console.error("Stripe update paymentLink error:", err);
        return json(500, { error: "Failed to deactivate payment link" });
      }
    }

    // 3) Cancel subscription if present
    if (session.subscription) {
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as any)?.id;

      if (!subId) {
        return json(400, { error: "No valid subscription id found on session" });
      }

      try {
        const canceledSub = await stripe.subscriptions.cancel(subId);
        return json(200, {
          success: true,
          id: sessionId,
          action: "subscription_canceled",
          subscription: canceledSub.id,
          status: canceledSub.status,
        });
      } catch (err: any) {
        if (isStripeMissingResource(err)) {
          return json(404, { error: "Subscription not found" });
        }
        console.error("Stripe cancel subscription error:", err);
        return json(500, { error: "Failed to cancel subscription" });
      }
    }

    return json(400, {
      error:
        "Cannot expire checkout session: no underlying payment_intent, payment_link, or subscription found",
    });
  } catch (err: any) {
    console.error("Error expiring checkout session:", err);
    return json(500, {
      error: "Unexpected server error while expiring checkout session",
    });
  }
}
