/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { NextRequest } from "next/server";
import { stripe, parseJson, errorJson } from "../../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/stripe/checkout/sessions/[id]
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> } // 👈 Promise
) {
  try {
    const { id } = await context.params; // 👈 await
    const session = await stripe.checkout.sessions.retrieve(id);
    return Response.json(session, { status: 200 });
  } catch (err: any) {
    return errorJson(err, 404);
  }
}

// POST /api/stripe/checkout/sessions/[id] (update)
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> } // 👈 Promise
) {
  try {
    const { id } = await context.params; // 👈 await
    const body = await parseJson<any>(req);
    const session = await stripe.checkout.sessions.update(id, body);
    return Response.json(session, { status: 200 });
  } catch (err: any) {
    return errorJson(err, 400);
  }
}
