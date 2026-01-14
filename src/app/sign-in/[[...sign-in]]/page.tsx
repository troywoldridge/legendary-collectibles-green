import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import SignInClient from "./SignInClient";

function absBase() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "") ||
    site?.url?.replace(/\/+$/, "") ||
    "https://legendary-collectibles.com"
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const canonical = `${absBase()}/sign-in`;

  return {
    title: `Sign in | ${site?.name ?? "Legendary Collectibles"}`,
    alternates: { canonical },

    // ✅ Do not index sign-in or its redirect_url variants
    robots: {
      index: false,
      follow: true,
      noarchive: true,
      nocache: true,
    },
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};

  // ✅ Canonicalize: if Google finds /sign-in?redirect_url=... (or anything),
  // immediately redirect to plain /sign-in to avoid "Duplicate without user-selected canonical".
  const hasAnyQuery = Object.keys(sp).length > 0;
  if (hasAnyQuery) {
    redirect("/sign-in");
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <SignInClient />
    </div>
  );
}
