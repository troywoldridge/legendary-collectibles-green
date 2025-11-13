/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { NextRequest } from "next/server";
import { stripe, errorJson } from "../../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/stripe/checkout/sessions/[id]/line_items
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // 👈 Promise
) {
  try {
    const { id } = await context.params; // 👈 await
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "10");
    const items = await stripe.checkout.sessions.listLineItems(id, {
      limit: Number.isFinite(limit) ? limit : 10,
    });
    return Response.json(items, { status: 200 });
  } catch (err: any) {
    return errorJson(err, 400);
  }
}
