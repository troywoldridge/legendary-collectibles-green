// src/app/support/sent/page.tsx
import "server-only";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SentPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const raw = typeof sp.ticket === "string" ? sp.ticket : "";
  // keep it safe + tidy for display (React escapes by default, this just trims/limits)
  const ticket = raw.trim().slice(0, 200) || "—";

  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-white">Thanks! We’ve got it.</h1>
      <p className="mt-3 text-white/80">
        Your ticket ID is{" "}
        <span className="font-mono font-semibold">{ticket}</span>. We’ve emailed you a
        receipt. Reply to that email to add more info anytime.
      </p>
      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex items-center rounded-md border border-white/10 bg-white/10 px-4 py-2 text-white hover:bg-white/15"
        >
          Back to Home
        </Link>
      </div>
    </section>
  );
}
