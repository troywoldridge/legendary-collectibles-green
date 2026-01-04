// src/app/shipping-returns/page.tsx
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-static";

export const metadata = {
  title: "Shipping & Returns | Legendary Collectibles",
  description: "Shipping timelines, packaging standards, and return/refund policy.",
};

export default function ShippingReturnsPage() {
  const SUPPORT_EMAIL = "support@legendary-collectibles.com";

  return (
    <section className="mx-auto max-w-3xl space-y-6 text-white">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Shipping &amp; Returns</h1>
        <p className="text-white/80">
          Clear policies so you know exactly what to expect.
        </p>
      </header>

      <div className="space-y-5 text-white/90 leading-relaxed">
        <h2 className="text-xl font-semibold text-white">Shipping</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Orders typically ship within 1–2 business days (excluding holidays).</li>
          <li>Tracking is provided when available.</li>
          <li>
            <strong>Sealed products are shipped unopened</strong> and in original condition.
          </li>
          <li>
            Singles are packaged to prevent bending and moisture damage (sleeved, protected, and secured).
          </li>
          <li>
            Graded cards and higher-value items receive additional protection to reduce risk in transit.
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-white">Returns</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            If an item arrives damaged, incorrect, or missing, contact us within{" "}
            <strong>48 hours</strong> of delivery so we can make it right.
          </li>
          <li>
            For sealed products, returns are generally only accepted if{" "}
            <strong>unopened</strong> and in original condition.
          </li>
          <li>
            Buyer is responsible for return shipping unless the return is due to our error.
          </li>
          <li>
            Please contact support before returning an item so we can provide the correct return instructions.
          </li>
        </ul>

        <h2 className="text-xl font-semibold text-white">Refunds</h2>
        <p>
          Once a return is received and inspected, refunds are processed back to the original payment method.
          Processing times can vary depending on your bank or card issuer.
        </p>

        <h2 className="text-xl font-semibold text-white">Need help?</h2>
        <p>
          Email{" "}
          <a
            className="text-sky-300 hover:underline"
            href={`mailto:${SUPPORT_EMAIL}`}
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          with your order number and we’ll take care of you.
        </p>
      </div>
    </section>
  );
}
