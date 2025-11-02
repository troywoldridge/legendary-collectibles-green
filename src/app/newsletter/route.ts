import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const email = String(form.get("email") ?? "").trim();
    if (!email) return new Response("Email required", { status: 400 });
    // TODO: save to your DB or ESP here
    return new Response("OK", { status: 200 });
  } catch (e) {
    return new Response("Error", { status: 500 });
  }
}
