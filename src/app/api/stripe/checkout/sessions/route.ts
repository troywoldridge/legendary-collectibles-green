/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { NextRequest } from "next/server";
import { stripe, baseUrlFromReq, parseJson, errorJson } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/stripe/checkout/sessions
export async function POST(req: NextRequest) {
  try {
    const body = await parseJson<any>(req);

    // Provide sensible defaults if caller omitted success/cancel URLs
    const base = baseUrlFromReq(req);
    const success_url = body.success_url ?? `${base}/checkout/success?sid={CHECKOUT_SESSION_ID}`;
    const cancel_url = body.cancel_url ?? `${base}/checkout/canceled`;

    // Minimal required: mode + line_items OR allow creating subscription by price
    // We pass through most fields so you can mirror the Stripe docs one-to-one.
    const session = await stripe.checkout.sessions.create({
      ...body,
      success_url,
      cancel_url,
    });

    return Response.json(session, { status: 200 });
  } catch (err: any) {
    return errorJson(err, 400);
  }
}

// GET /api/stripe/checkout/sessions?limit=3&starting_after=...&ending_before=...
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const limit = Number(searchParams.get("limit") ?? "10");
    const starting_after = searchParams.get("starting_after") ?? undefined;
    const ending_before = searchParams.get("ending_before") ?? undefined;

    const sessions = await stripe.checkout.sessions.list({
      limit: Number.isFinite(limit) ? limit : 10,
      starting_after: starting_after || undefined,
      ending_before: ending_before || undefined,
    });

    return Response.json(sessions, { status: 200 });
  } catch (err: any) {
    return errorJson(err, 400);
  }
}
