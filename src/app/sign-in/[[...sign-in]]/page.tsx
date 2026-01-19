import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import SignInClient from "./SignInClient";

export const metadata: Metadata = {
  title: `Sign in | ${site?.name ?? "Legendary Collectibles"}`,
  alternates: { canonical: "/sign-in" },
  robots: {
    index: false,
    follow: true,
    noarchive: true,
    nocache: true,
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};

  // Optional: canonicalize /sign-in?anything -> /sign-in
  if (Object.keys(sp).length > 0) {
    redirect("/sign-in");
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <SignInClient />
    </div>
  );
}
