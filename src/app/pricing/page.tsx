// src/app/pricing/page.tsx
import "server-only";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <h1 className="text-3xl font-bold text-white">Choose your plan</h1>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Free */}
        <form
          action="/api/plans/activate-free"
          method="POST"
          className="rounded-2xl border border-white/15 bg-white/5 p-6"
        >
          <h2 className="text-xl font-semibold text-white">Free</h2>
          <p className="mt-1 text-white/70 text-sm">Browse only. No collection storage.</p>
          <div className="mt-4 text-3xl font-bold text-white">$0</div>
          <button className="mt-6 w-full rounded-md bg-white/10 px-4 py-2 text-white hover:bg-white/15">
            Continue free
          </button>
        </form>

        {/* Collector */}
        <form
          action="/api/billing/create-checkout-session"
          method="POST"
          className="rounded-2xl border border-white/15 bg-white/5 p-6"
        >
          <h2 className="text-xl font-semibold text-white">Collector</h2>
          <p className="mt-1 text-white/70 text-sm">Tracker (1 collection, 500 items).</p>
          <div className="mt-4 text-3xl font-bold text-white">
            $4.99<span className="text-base font-normal">/mo</span>
          </div>
          <input type="hidden" name="plan" value="collector" />
          <button className="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500">
            Start Collector
          </button>
        </form>

        {/* Pro */}
        <form
          action="/api/billing/create-checkout-session"
          method="POST"
          className="rounded-2xl border border-white/15 bg-white/5 p-6"
        >
          <h2 className="text-xl font-semibold text-white">Pro</h2>
          <p className="mt-1 text-white/70 text-sm">High limits + extras (alerts, reports).</p>
          <div className="mt-4 text-3xl font-bold text-white">
            $9.99<span className="text-base font-normal">/mo</span>
          </div>
          <input type="hidden" name="plan" value="pro" />
          <button className="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500">
            Start Pro
          </button>
        </form>
      </div>

      <p className="text-sm text-white/60">
        Have an account?{" "}
        <Link href="/sign-in" className="text-sky-300 hover:underline">
          Log in
        </Link>
      </p>
    </section>
  );
}
