// src/app/api/health/route.ts
export const runtime = "nodejs";
export async function GET() {
  return new Response("ok", { status: 200 });
}
