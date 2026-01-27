// src/app/admin/funko/new/page.tsx
import "server-only";

import Link from "next/link";
import AdminTokenGate from "@/components/admin/AdminApiTokenGate";
import { upsertFunkoFromForm } from "./actions";
import FunkoNewFormClient from "./FunkoNewFormClient"; // ✅ must exist in same folder

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Record<string, string | string[] | undefined>;

function one(sp: SearchParams, k: string) {
  const v = sp?.[k];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function AdminFunkoNewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const errorRaw = one(sp, "error");
  const okRaw = one(sp, "ok");

  const error = errorRaw ? String(errorRaw) : "";
  const ok = okRaw ? String(okRaw) : "";

  return (
    <AdminTokenGate>
      <section className="space-y-6">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">Add Funko Catalog Item</h1>
              <p className="mt-2 text-sm text-white/70">
                Creates/updates a row in <code>public.funko_items</code> and images in{" "}
                <code>public.funko_item_images</code>.
              </p>
            </div>

            <div className="text-sm">
              <Link href="/categories/funko/items" className="text-sky-300 hover:underline">
                View catalog →
              </Link>
            </div>
          </div>

          {ok ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              {ok === "1" ? "Saved." : ok}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        {/* ✅ client form that auto-builds extra_json */}
        <FunkoNewFormClient action={upsertFunkoFromForm} />

        <div className="text-xs text-white/60">
          After saving, you can visit: <code className="break-all">/categories/funko/items/&lt;id&gt;</code>
        </div>
      </section>
    </AdminTokenGate>
  );
}
