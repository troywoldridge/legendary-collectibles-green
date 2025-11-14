/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/collection/edit/[id]/page.tsx
import "server-only";

import { notFound, redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auth } from "@clerk/nextjs/server";
import EditCollectionForm from "@/components/EditCollectionForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

export default async function EditCollectionItemPage({
  params,
}: {
  params: Promise<Params> | Params;
}) {
  const resolved = params instanceof Promise ? await params : params;
  const { id } = resolved;

  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const res = await db.execute<any>(
    sql`SELECT * FROM user_collection_items WHERE id = ${id} AND user_id = ${userId} LIMIT 1`
  );
  const row = res.rows[0];

  if (!row) {
    notFound();
  }

  // Normalize purchase_date to YYYY-MM-DD string for the <input type="date">
  let purchaseDate: string | null = null;
  if (row.purchase_date) {
    if (typeof row.purchase_date === "string") {
      purchaseDate = row.purchase_date.slice(0, 10);
    } else if (row.purchase_date instanceof Date) {
      purchaseDate = row.purchase_date.toISOString().slice(0, 10);
    }
  }

  const item = {
    ...row,
    purchase_date: purchaseDate,
  };

  return (
    <section className="max-w-3xl mx-auto p-4 text-white">
      <h1 className="text-2xl font-bold mb-4">Edit Collection Item</h1>
      <EditCollectionForm item={item} />
    </section>
  );
}
