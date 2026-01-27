// src/app/collection/funko/page.tsx
import "server-only";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import FunkoCollectionClient from "./FunkoCollectionClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Page() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?redirect_url=/collection/funko");

  return <FunkoCollectionClient />;
}
