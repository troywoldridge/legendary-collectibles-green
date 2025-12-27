import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const accountId = process.env.CF_IMAGES_ACCOUNT_ID;
  const apiToken = process.env.CF_IMAGES_API_TOKEN;

  if (!accountId || !apiToken) {
    return NextResponse.json(
      { error: "Missing CF_IMAGES_ACCOUNT_ID or CF_IMAGES_API_TOKEN" },
      { status: 500 }
    );
  }

  // Optional metadata from client (not public)
  const body = await req.json().catch(() => ({}));
  const metadata = body?.metadata ?? null;

  const form = new FormData();
  // If you ever want signed URLs later, flip this:
  form.append("requireSignedURLs", "false");
  if (metadata) form.append("metadata", JSON.stringify(metadata));

  const cfRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2/direct_upload`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: form,
    }
  );

  const json = await cfRes.json().catch(() => null);

  if (!cfRes.ok || !json?.success) {
    return NextResponse.json(
      { error: "Cloudflare direct_upload failed", details: json ?? null },
      { status: 500 }
    );
  }

  // returns: { result: { id, uploadURL } }
  return NextResponse.json({
    id: json.result.id,
    uploadURL: json.result.uploadURL,
  });
}
