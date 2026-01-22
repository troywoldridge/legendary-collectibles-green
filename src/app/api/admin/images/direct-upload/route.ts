import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CfDirectUploadOk = {
  success: true;
  result: { id: string; uploadURL: string };
};

type CfDirectUploadErr = {
  success: false;
  errors?: unknown;
  messages?: unknown;
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickCfUpload(json: unknown): { ok: true; id: string; uploadURL: string } | { ok: false } {
  if (!isObject(json)) return { ok: false };
  if (json.success !== true) return { ok: false };

  const result = json.result;
  if (!isObject(result)) return { ok: false };

  const id = typeof result.id === "string" ? result.id : null;
  const uploadURL = typeof result.uploadURL === "string" ? result.uploadURL : null;

  if (!id || !uploadURL) return { ok: false };
  return { ok: true, id, uploadURL };
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: auth.error },
      { status: 401 },
    );
  }

  const accountId = process.env.CF_IMAGES_ACCOUNT_ID;
  const apiToken = process.env.CF_IMAGES_API_TOKEN;

  if (!accountId || !apiToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "server_misconfig",
        message: "Missing CF_IMAGES_ACCOUNT_ID or CF_IMAGES_API_TOKEN",
      },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const metadata = body?.metadata ?? null;

  const form = new FormData();
  form.append("requireSignedURLs", "false");
  if (metadata) form.append("metadata", JSON.stringify(metadata));

  const cfRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2/direct_upload`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: form,
    },
  );

  const json = (await cfRes.json().catch(() => null)) as unknown;

  const picked = pickCfUpload(json);

  if (!cfRes.ok || !picked.ok) {
    // keep details for debugging
    return NextResponse.json(
      {
        ok: false,
        error: "cloudflare_error",
        message: "Cloudflare direct_upload failed",
        status: cfRes.status,
        details: json as CfDirectUploadErr | CfDirectUploadOk | null,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: picked.id,
    uploadURL: picked.uploadURL,
  });
}
