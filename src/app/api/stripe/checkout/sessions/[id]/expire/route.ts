/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { NextRequest } from "next/server";
import { stripe, errorJson } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/stripe/checkout/sessions/[id]/expire
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> } // 👈 accept Promise
) {
  try {
    const { id } = await context.params; // 👈 await it
    const session = await stripe.checkout.sessions.expire(id);
    return Response.json(session, { status: 200 });
  } catch (err: any) {
    return errorJson(err, 400);
  }
}
