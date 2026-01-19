import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { site } from "@/config/site";
import SignUpClient from "./SignUpClient";

export const metadata: Metadata = {
  title: `Sign up | ${site?.name ?? "Legendary Collectibles"}`,
  alternates: { canonical: "/sign-up" },
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

  // Optional: canonicalize /sign-up?anything -> /sign-up
  if (Object.keys(sp).length > 0) {
    redirect("/sign-up");
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <SignUpClient />
    </div>
  );
}
