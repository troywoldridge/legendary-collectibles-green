// src/app/contact/page.tsx
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contact Us | Legendary Collectibles",
  description: "Get help with orders, returns, and general questions.",
};

export default function ContactPage() {
  return (
    <section className="mx-auto max-w-3xl space-y-6 text-white">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Contact</h1>
        <p className="text-white/80">
          Need help with an order, a return, or a question about a card? Reach out — we respond fast.
        </p>
      </header>

      <div className="rounded-xl border border-white/15 bg-white/5 p-5 space-y-4">
        <div>
          <div className="text-sm text-white/70">Email</div>
          <a className="text-sky-300 hover:underline" href="mailto:support@legendary-collectibles.com">
            support@legendary-collectibles.com
          </a>
        </div>

        <div>
          <div className="text-sm text-white/70">Order help</div>
          <p className="text-white/90">
            Include your order number and the email used at checkout so we can help immediately.
          </p>
        </div>

        <div>
          <div className="text-sm text-white/70">Business hours</div>
          <p className="text-white/90">Mon–Fri, 9am–5pm (ET)</p>
        </div>
      </div>

      <div className="text-sm text-white/70">
        Tip: For the quickest resolution, include photos for damaged items and packaging.
      </div>
    </section>
  );
}
