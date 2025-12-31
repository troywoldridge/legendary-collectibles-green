// src/app/faq/page.tsx
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "FAQ | Legendary Collectibles",
  description: "Frequently asked questions about shipping, returns, grading, and orders.",
};

function QA({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-5">
      <div className="font-semibold text-white">{q}</div>
      <div className="mt-2 text-white/85 leading-relaxed">{children}</div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <section className="mx-auto max-w-3xl space-y-4 text-white">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">FAQ</h1>
        <p className="text-white/80">Answers to common questions about our shop.</p>
      </header>

      <div className="space-y-3">
        <QA q="Do you guarantee authenticity?">
          Yes. We stand behind what we sell. If you ever have a concern, contact us immediately.
        </QA>

        <QA q="How are singles packaged?">
          Cards are protected using penny sleeves/top loaders or equivalent protection, then packed
          to prevent bending and moisture.
        </QA>

        <QA q="Do you combine shipping?">
          Usually yes. If multiple items ship together, we’ll do our best to consolidate and keep
          shipping costs fair.
        </QA>

        <QA q="How do returns work?">
          See our Shipping & Returns policy for details. If something arrives damaged or incorrect,
          contact us right away and we’ll make it right.
        </QA>

        <QA q="Can I cancel an order?">
          If your order hasn’t shipped yet, contact us ASAP and we’ll try to stop it. Once shipped,
          returns follow our standard policy.
        </QA>

        <QA q="Do you sell graded cards?">
          Yes. Listings will state the grading company (PSA/BGS/CGC/etc.) and the grade on the item.
        </QA>
      </div>
    </section>
  );
}
