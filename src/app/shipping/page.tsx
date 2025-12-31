// src/app/shipping-returns/page.tsx
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Shipping & Returns | Legendary Collectibles",
  description: "Shipping timelines, packaging standards, and return policy.",
};

export default function ShippingReturnsPage() {
  return (
    <section className="mx-auto max-w-3xl space-y-6 text-white">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Shipping & Returns</h1>
        <p className="text-white/80">Clear policies so you know exactly what to expect.</p>
      </header>

      <div className="space-y-5 text-white/90 leading-relaxed">
        <h2 className="text-xl font-semibold text-white">Shipping</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Orders typically ship within 1–2 business days.</li>
          <li>Tracking is provided when available.</li>
          <li>We package singles to prevent bending and moisture damage.</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">Returns</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            If an item arrives damaged, incorrect, or missing, contact us within 48 hours of delivery.
          </li>
          <li>
            For sealed products, returns are generally only accepted if unopened and in original condition.
          </li>
          <li>
            Buyer is responsible for return shipping unless the return is due to our error.
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-white">Refunds</h2>
        <p>
          Once a return is received and inspected, refunds are processed back to the original payment method.
        </p>

        <h2 className="text-xl font-semibold text-white">Need help?</h2>
        <p>
          Email{" "}
          <a className="text-sky-300 hover:underline" href="mailto:support@legendary-collectibles.com">
            support@legendary-collectibles.com
          </a>{" "}
          with your order number and we’ll take care of you.
        </p>
      </div>
    </section>
  );
}
