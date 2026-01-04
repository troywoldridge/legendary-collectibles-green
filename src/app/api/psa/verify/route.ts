// src/app/api/psa/verify/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { psaGetByCertNumber } from "@/lib/psa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  itemId?: string;       // preferred
  certNumber?: string;   // optional (used if itemId not given)
};

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

// We keep this conservative: PSA response fields vary.
// We try a few likely keys.
function extractGradeLabel(payload: any): string | null {
  if (!payload) return null;

  // Common possibilities (depends on PSA payload)
  const candidates = [
    payload.Grade,
    payload.grade,
    payload.FinalGrade,
    payload.finalGrade,
    payload.GradeLabel,
    payload.gradeLabel,
  ];

  for (const c of candidates) {
    const v = norm(c);
    if (v) return v;
  }

  return null;
}

function extractCertNumber(payload: any, fallback: string): string {
  if (!payload) return fallback;
  const candidates = [
    payload.CertNumber,
    payload.certNumber,
    payload.Cert,
    payload.cert,
    payload.CertificateNumber,
    payload.certificateNumber,
  ];
  for (const c of candidates) {
    const v = norm(c);
    if (v) return v;
  }
  return fallback;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const itemId = norm(body.itemId);
  const certFromBody = norm(body.certNumber);

  // If itemId provided, load item and use its cert_number unless certNumber explicitly provided.
  let item: {
    id: string;
    user_id: string;
    grading_company: string;
    grade_label: string;
    cert_number: string | null;
  } | null = null;

  let certNumber = certFromBody;

  if (itemId) {
    const res = await db.execute<{
      id: string;
      user_id: string;
      grading_company: string;
      grade_label: string;
      cert_number: string | null;
    }>(sql`
      SELECT id, user_id, grading_company, grade_label, cert_number
      FROM public.user_collection_items
      WHERE id = ${itemId} AND user_id = ${userId}
      LIMIT 1
    `);

    item = res.rows?.[0] ?? null;
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    // Must be PSA for this route
    const grader = norm(item.grading_company).toUpperCase();
    if (grader !== "PSA") {
      return NextResponse.json({ error: "Item is not PSA graded" }, { status: 400 });
    }

    // Prefer explicit cert from request, else from item
    if (!certNumber) certNumber = norm(item.cert_number);
  }

  if (!certNumber) {
    return NextResponse.json({ error: "Missing cert number" }, { status: 400 });
  }

  // Call PSA API
  const result = await psaGetByCertNumber(certNumber);

  // "Verified" = HTTP ok + PSA says request valid (payload varies, but this is a stable field in their docs)
  const isValid = Boolean((result as any)?.data?.IsValidRequest);
  const success = Boolean(result.ok && isValid);

  // Update item if we have one
  if (item) {
    const payload = result.data;

    // We can optionally trust PSA for grade/cert normalization
    const psaGrade = extractGradeLabel(payload);
    const psaCert = extractCertNumber(payload, certNumber);

    await db.execute(sql`
      UPDATE public.user_collection_items
      SET
        cert_number = ${psaCert},
        -- only overwrite grade_label if PSA returns one and user didn't set it
        grade_label = CASE
          WHEN (${psaGrade} IS NOT NULL AND btrim(COALESCE(grade_label,'')) = '') THEN ${psaGrade}
          ELSE grade_label
        END,
        is_verified = ${success},
        verified_at = CASE WHEN ${success} THEN now() ELSE NULL END,
        verification_source = 'psa',
        verification_payload = ${JSON.stringify(payload)}::jsonb,
        updated_at = now()
      WHERE id = ${itemId} AND user_id = ${userId}
    `);

    // Enqueue revalue job (debounced by partial unique index)
    await db.execute(sql`
      INSERT INTO public.user_revalue_jobs (user_id, status)
      VALUES (${userId}, 'queued')
      ON CONFLICT ON CONSTRAINT ux_user_revalue_jobs_active_user
      DO NOTHING
    `);
  }

  return NextResponse.json({
    ok: true,
    verified: success,
    certNumber,
    psa: {
      status: result.status,
      isValidRequest: isValid,
      serverMessage: (result as any)?.data?.ServerMessage ?? null,
    },
    data: result.data,
    updatedItem: item ? { itemId } : null,
  });
}
