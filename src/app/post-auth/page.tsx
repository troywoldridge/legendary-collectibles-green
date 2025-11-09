// src/app/post-auth/page.tsx
import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { userPlans } from "@/lib/db/schema/billing";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PostAuth() {
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
