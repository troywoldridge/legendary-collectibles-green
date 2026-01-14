import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import SignUpClient from "./SignUpClient";

function absBase() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "") ||
    site?.url?.replace(/\/+$/, "") ||
    "https://legendary-collectibles.com"
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const canonical = `${absBase()}/sign-up`;

  return {
    title: `Sign up | ${site?.name ?? "Legendary Collectibles"}`,
    alternates: { canonical },

    // ✅ Do not index sign-up or its redirect_url variants
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

  // ✅ Canonicalize: redirect /sign-up?anything -> /sign-up
  if (Object.keys(sp).length > 0) {
    redirect("/sign-up");
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <SignUpClient />
    </div>
  );
}
