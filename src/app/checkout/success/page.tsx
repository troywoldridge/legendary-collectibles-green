import "server-only";
import Stripe from "stripe";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

export default async function SuccessPage({ searchParams }: { searchParams: SP }) {
  const sid = typeof searchParams.sid === "string" ? searchParams.sid : undefined;

  if (!sid) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <h1 className="text-2xl font-semibold">Checkout complete</h1>
        <p className="mt-2 text-sm text-white/70">
          We didn’t receive a session id. If you paid, your account will still be updated once Stripe confirms the payment.
        </p>
        <div className="mt-6">
          <Link href="/account" className="underline">Go to Account</Link>
        </div>
      </div>
    );
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <h1 className="text-2xl font-semibold">Missing Stripe key</h1>
        <p className="mt-2 text-sm text-white/70">Set STRIPE_SECRET_KEY on the server.</p>
      </div>
    );
  }

  const stripe = new Stripe(key);
  let session: Stripe.Checkout.Session | null = null;
  let items: Stripe.ApiList<Stripe.LineItem> | null = null;

  try {
    session = await stripe.checkout.sessions.retrieve(sid);
    // line items:
    items = await stripe.checkout.sessions.listLineItems(sid, { limit: 25 });
  } catch (e: any) {
    const msg = e?.raw?.message || e?.message || "Failed to retrieve session";
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <h1 className="text-2xl font-semibold">Checkout complete</h1>
        <p className="mt-2 text-sm text-red-300">{msg}</p>
        <div className="mt-6">
          <Link href="/account" className="underline">Go to Account</Link>
        </div>
      </div>
    );
  }

  const total = (session.amount_total ?? 0) / 100;
  const currency = (session.currency ?? "usd").toUpperCase();
  const email = session.customer_details?.email ?? session.customer_email ?? "—";

  return (
    <div className="max-w-2xl mx-auto py-16 px-4">
      <h1 className="text-2xl font-semibold">You’re all set 🎉</h1>
      <p className="mt-2 text-sm text-white/70">
        Thanks! We’ve sent a receipt to <span className="font-medium">{email}</span>.
      </p>

      <div className="mt-6 rounded-lg border border-white/10">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="text-sm text-white/70">Session</div>
          <div className="text-xs text-white/50">{sid}</div>
        </div>
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">Status</div>
            <div className="text-sm font-medium">{session.payment_status ?? "—"}</div>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm">Total</div>
            <div className="text-sm font-medium">
              {currency} {total.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm mb-1">Items</div>
            <ul className="text-sm text-white/80 list-disc pl-5">
              {(items?.data ?? []).map((li) => (
                <li key={li.id}>
                  {li.description ?? "Item"} — {li.quantity ?? 1} × {(li.amount_total ?? 0) / 100} {currency}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-8 flex gap-4">
        <Link href="/account" className="px-4 py-2 rounded bg-white/10 hover:bg-white/15">Go to Account</Link>
        <Link href="/" className="px-4 py-2 rounded border border-white/10 hover:bg-white/20">Back to Home</Link>
      </div>
    </div>
  );
}
