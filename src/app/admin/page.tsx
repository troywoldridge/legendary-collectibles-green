import "server-only";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
      <p className="mt-2 opacity-80">Pick a tool:</p>

      <div className="mt-6 grid gap-3">
        <Link
          href="/admin/inventory"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10"
        >
          <div className="font-medium">Inventory</div>
          <div className="text-sm opacity-70">Drafts, intake, items.</div>
        </Link>

        <Link
          href="/admin/ai/listings"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10"
        >
          <div className="font-medium">AI Listings</div>
          <div className="text-sm opacity-70">Generate + apply listing copy.</div>
        </Link>
      </div>
    </div>
  );
}
