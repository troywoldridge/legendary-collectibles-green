export async function GET() {
  return Response.json({ ok: true, when: new Date().toISOString() });
}