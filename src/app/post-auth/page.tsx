// src/app/post-auth/page.tsx
import "server-only";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { userPlans } from "@/lib/db/schema/billing";
import { eq } from "drizzle-orm";
import { site } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function absBase() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "") ||
    site?.url?.replace(/\/+$/, "") ||
    "https://legendary-collectibles.com"
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const canonical = `${absBase()}/post-auth`;

  return {
    title: `Redirecting… | ${site?.name ?? "Legendary Collectibles"}`,
    alternates: { canonical },

    // ✅ Never index this (it’s a pure redirect utility page)
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nocache: true,
    },
  };
}

export default async function PostAuth({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ✅ Canonicalize: /post-auth?anything -> /post-auth
  const sp = (await searchParams) ?? {};
  if (Object.keys(sp).length > 0) {
    redirect("/post-auth");
  }

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const row = await db
    .select({ planId: userPlans.planId })
    .from(userPlans)
    .where(eq(userPlans.userId, userId))
    .limit(1);

  const planId = row[0]?.planId ?? null;

  if (!planId) redirect("/pricing"); // no plan chosen yet
  redirect("/collections");
}
