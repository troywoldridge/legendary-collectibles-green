// src/app/pro/movers/page.tsx
import "server-only";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import MoversClient from "./MoversClient";
import { getUserPlan, canSeeTrends } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProMoversPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const plan = await getUserPlan(userId);
  if (!canSeeTrends(plan)) redirect("/pricing");

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-4 text-white">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Movers</h1>
            <p className="mt-1 text-sm text-white/70">
              See what moved most in your collection based on market history.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/pro"
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
            >
              Back to Pro tools
            </a>
          </div>
        </div>
      </header>

      <MoversClient />
    </section>
  );
}
