// src/app/admin/collectibles/new/page.tsx
import "server-only";

import type { Metadata } from "next";
import Link from "next/link";
import CollectiblesNewFormClient from "./CollectiblesNewFormClient";
import { upsertCollectiblesFromForm } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "New Collectibles Item • Admin",
  robots: { index: false, follow: false },
};

export default function Page({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const ok = typeof searchParams?.ok === "string" ? searchParams?.ok : "";
  const error = typeof searchParams?.error === "string" ? searchParams?.error : "";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/60">Admin</div>
          <h1 className="mt-2 text-3xl font-semibold text-white">New Figures &amp; Collectibles Item</h1>
          <p className="mt-2 text-sm text-white/70">
            Creates a row in <code>collectibles_items</code> and optional shop product in <code>products</code>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/categories/collectibles/items"
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/90 hover:bg-white/10"
          >
            View Collectibles Catalog
          </Link>
        </div>
      </div>

      {ok ? (
        <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          {ok}
        </div>
      ) : null}

      {error ? (
        <div className="mt-6 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="mt-8">
        <CollectiblesNewFormClient action={upsertCollectiblesFromForm} />
      </div>
    </main>
  );
}
