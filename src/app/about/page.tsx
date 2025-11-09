// src/app/about/page.tsx
import "server-only";
import Link from "next/link";

export const runtime = "nodejs";
// This page is mostly static text. Feel free to remove `dynamic` if you prefer SSG.
export const dynamic = "force-static";

export const metadata = {
  title: "About Us • Legendary Collectibles",
  description:
    "Legendary Collectibles is a modern destination for trading cards and collectibles — Pokémon, Yu-Gi-Oh!, Magic: The Gathering, sports cards, and more — with powerful search, real-time price insights, and beautiful image galleries.",
  openGraph: {
    title: "About Legendary Collectibles",
    description:
      "A modern destination for trading cards & collectibles with powerful search, real-time price insights, and beautiful image galleries.",
    url: "https://www.legendary-collectibles.com/about",
    siteName: "Legendary Collectibles",
    type: "website",
  },
  alternates: {
    canonical: "/about",
  },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="prose prose-invert prose-sm max-w-none">
        {children}
      </div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <>
      {/* JSON-LD (Organization) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Legendary Collectibles",
            url: "https://www.legendary-collectibles.com",
            logo:
              "https://www.legendary-collectibles.com/_next/static/media/logo.png",
            sameAs: [
              "https://www.facebook.com/",
              "https://www.instagram.com/",
              "https://x.com/",
            ],
          }),
        }}
      />

      <div className="mx-auto max-w-5xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
        {/* Hero */}
        <header className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
          <h1 className="text-3xl font-bold text-white">About Legendary Collectibles</h1>
          <p className="mt-2 text-white/80">
            A modern destination for trading cards and collectibles — built by collectors,
            for collectors. Explore Pokémon, Yu-Gi-Oh!, Magic: The Gathering, sports cards,
            Funko-style figures, and more with powerful search, price insights, and beautiful galleries.
          </p>
        </header>

        <Section title="Our Mission">
          <p>
            Collecting should be <strong>fun, transparent, and accessible</strong>. Legendary
            Collectibles brings together accurate data, crisp imagery, and a streamlined
            experience so you can discover sets, research cards, and track market info in one place.
          </p>
          <ul>
            <li><strong>Discover faster:</strong> clean navigation, smart filters, and set / card indexes.</li>
            <li><strong>Research smarter:</strong> price snapshots and trends where available.</li>
            <li><strong>Enjoy the view:</strong> high-quality images with careful attribution.</li>
          </ul>
        </Section>

        <Section title="What We Cover">
          <ul>
            <li><strong>TCG:</strong> Pokémon, Yu-Gi-Oh!, Magic: The Gathering (more games on deck).</li>
            <li><strong>Sports Cards:</strong> Baseball, Basketball, Football — from vintage to modern releases.</li>
            <li><strong>Collectibles:</strong> Figures and popular pop-culture items as we expand our catalog.</li>
          </ul>
          <p className="mt-2">
            Our catalog grows continuously as we ingest new sets, cards, images, and
            pricing snapshots.
          </p>
        </Section>

        <Section title="Price & Data Transparency">
          <p>
            When available, we surface <em>snapshot pricing</em> and references gathered from reputable
            sources and marketplaces. We show the source, timestamp (when provided), and key metadata to help
            you evaluate context and recency. Prices can change quickly — treat them as informational, not as
            appraisals or guarantees.
          </p>
          <p className="mt-2">
            Our data pipeline favors <strong>traceability</strong> and <strong>repeatability</strong>.
            We aim to show where information came from and keep noisy or duplicate records out of your way.
          </p>
        </Section>

        <Section title="Images & Attribution">
          <p>
            Card imagery is collected from official publishers, public databases, and
            marketplace listings where allowed. We always try to include attribution and
            respect licenses/terms. If you see an image that should be removed or corrected,
            please contact{" "}
            <a href="mailto:support@legendary-collectibles.com">support@legendary-collectibles.com</a>.
          </p>
          <p className="mt-2">
            We are also building first-party galleries powered by Cloudflare Images to improve resiliency
            and performance while preserving credits and rights information.
          </p>
        </Section>

        <Section title="Condition, Grading & Authenticity">
          <p>
            We’re collectors too, so we take condition seriously. When we reference graded
            prices (e.g., PSA/SGC/BGS or vendor-labeled “graded”), we label them explicitly
            as graded and treat them separately from raw/loose pricing. We do not grade cards
            ourselves and cannot authenticate third-party items; always review listings and grading
            standards directly with the seller or grader.
          </p>
        </Section>

        <Section title="Community & Roadmap">
          <ul>
            <li><strong>Wishlists & Vault:</strong> track favorites and personal watch lists (rolling out).</li>
            <li><strong>More sports & sets:</strong> expanding modern and vintage coverage, plus checklists.</li>
            <li><strong>Richer pricing:</strong> more sources and longer time-series where permitted.</li>
            <li><strong>Better images:</strong> de-duplicated, higher-resolution fronts/backs with credits.</li>
            <li><strong>Seller tools:</strong> optional tools for inventory & listing prep (in exploration).</li>
          </ul>
        </Section>

        <Section title="How We Build">
          <p>
            Legendary Collectibles is crafted with a modern web stack focused on speed,
            reliability, and data integrity. We optimize pages for fast loading, use edge
            delivery for media, and continuously refine our import pipelines for accuracy.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            We love feedback, corrections, and ideas. Reach us anytime at{" "}
            <a className="underline" href="mailto:support@legendary-collectibles.com">
              support@legendary-collectibles.com
            </a>.
          </p>
          <p className="mt-2">
            Found a data issue? Include the card/set URL and a short description so we can
            verify and fix it quickly.
          </p>
        </Section>

        <Section title="Disclaimers">
          <p>
            Legendary Collectibles is an independent project and is not affiliated with or
            endorsed by The Pokémon Company International, Wizards of the Coast, Konami,
            Panini, Topps, Upper Deck, or any other publisher or rights holder. All trademarks,
            logos, and brand names are the property of their respective owners. Images and data
            shown on this site are used under applicable terms, licenses, and fair-use guidelines.
          </p>
          <p className="mt-2">
            Pricing and availability are subject to change and are provided for informational purposes only.
            Nothing on this site constitutes financial advice or a guarantee of value.
          </p>
        </Section>

        <footer className="border-t border-white/10 pt-6 text-white/70">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/categories" className="text-sky-300 hover:underline">
              Browse Categories →
            </Link>
            <Link href="/search" className="text-sky-300 hover:underline">
              Search the Catalog →
            </Link>
          </div>
          <div className="mt-3 text-xs">
            © {new Date().getFullYear()} Legendary Collectibles. All rights reserved.
          </div>
        </footer>
      </div>
    </>
  );
}
