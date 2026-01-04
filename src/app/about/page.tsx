// src/app/about/page.tsx
import "server-only";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-static";

export const metadata = {
  title: "About Us • Legendary Collectibles",
  description:
    "Legendary Collectibles is a modern trading card and collectibles shop — Pokémon, Yu-Gi-Oh!, MTG, sports cards, and more — with powerful search, transparent pricing context, and beautiful galleries.",
  openGraph: {
    title: "About Legendary Collectibles",
    description:
      "A collector-first shop for trading cards & collectibles with great search, pricing context, and curated galleries.",
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
      <div className="prose prose-invert prose-sm max-w-none">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  const year = new Date().getFullYear();

  const SUPPORT_EMAIL = "support@legendary-collectibles.com";
  const ADDRESS_LINE_1 = "PO Box 477";
  const ADDRESS_LINE_2 = "Vanceburg, KY 41179";
  const FULL_ADDRESS = `${ADDRESS_LINE_1}, ${ADDRESS_LINE_2}`;

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
            email: SUPPORT_EMAIL,
            address: {
              "@type": "PostalAddress",
              streetAddress: ADDRESS_LINE_1,
              addressLocality: "Vanceburg",
              addressRegion: "KY",
              postalCode: "41179",
              addressCountry: "US",
            },
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
          <h1 className="text-3xl font-bold text-white">
            About Legendary Collectibles
          </h1>
          <p className="mt-2 text-white/80">
            Legendary Collectibles is a modern destination for trading cards and
            collectibles — built by collectors, for collectors. Shop and explore
            Pokémon, Yu-Gi-Oh!, Magic: The Gathering, sports cards, and more with
            clean navigation, transparent pricing context, and beautiful galleries.
          </p>
        </header>

        <Section title="Collector-First, Retail-Ready">
          <p>
            We’re here for the fun part of the hobby: discovering new sets, hunting
            favorites, and building collections you’re proud of. Alongside research tools,
            we also offer <strong>sealed TCG product</strong>, <strong>singles</strong>,{" "}
            <strong>graded cards</strong>, and <strong>accessories</strong>.
          </p>
          <p className="mt-2">
            We aim to source inventory through <strong>authorized distribution</strong> and
            trusted partners, with a focus on authenticity, careful handling, and clear policies.
          </p>
        </Section>

        <Section title="Our Mission">
          <p>
            Collecting should be <strong>fun, transparent, and accessible</strong>.
            Legendary Collectibles brings together accurate data, crisp imagery, and a
            streamlined experience so you can discover sets, research cards, and track
            market context in one place.
          </p>
          <ul>
            <li>
              <strong>Discover faster:</strong> clean navigation, smart filters, and set/card indexes.
            </li>
            <li>
              <strong>Research smarter:</strong> price snapshots and trends where available.
            </li>
            <li>
              <strong>Shop confidently:</strong> clear condition notes, careful packaging, and straightforward policies.
            </li>
          </ul>
        </Section>

        <Section title="What We Carry & Cover">
          <p>
            Our catalog continues to grow as we add new sets, card records, images, and pricing snapshots.
            We focus on hobby staples and expand thoughtfully as the site grows.
          </p>
          <ul>
            <li>
              <strong>TCG:</strong> Pokémon, Yu-Gi-Oh!, Magic: The Gathering (more games on deck).
            </li>
            <li>
              <strong>Sports Cards:</strong> Baseball, Basketball, Football — from vintage to modern releases.
            </li>
            <li>
              <strong>Collectibles:</strong> Figures and pop-culture items as we expand our inventory.
            </li>
            <li>
              <strong>Accessories:</strong> sleeves, binders, storage, and display solutions.
            </li>
          </ul>
        </Section>

        <Section title="Pricing & Data Transparency">
          <p>
            When available, we surface <em>snapshot pricing</em> and references gathered from
            reputable sources and marketplaces. We show the source, timestamp (when provided), and key
            metadata to help you evaluate context and recency.
          </p>
          <p className="mt-2">
            Prices can change quickly — treat them as informational, not as appraisals or guarantees.
          </p>
          <p className="mt-2">
            Our data pipeline favors <strong>traceability</strong> and <strong>repeatability</strong>.
            We aim to show where information came from and keep noisy or duplicate records out of your way.
          </p>
        </Section>

        <Section title="Images & Attribution">
          <p>
            Card imagery may be collected from official publishers, public databases, and
            marketplace listings where allowed. We always try to include attribution and respect
            licenses/terms. If you see an image that should be removed or corrected, please contact{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
          </p>
          <p className="mt-2">
            We are also building first-party galleries powered by Cloudflare Images to improve resiliency
            and performance while preserving credits and rights information.
          </p>
        </Section>

        <Section title="Condition, Grading & Authenticity">
          <p>
            We’re collectors too, so we take condition seriously. Listings are described as clearly as
            possible and packaged to prevent bending and moisture damage.
          </p>
          <p className="mt-2">
            When we reference graded prices (e.g., PSA/SGC/BGS or vendor-labeled “graded”), we label them
            explicitly as graded and treat them separately from raw pricing.
          </p>
          <p className="mt-2">
            We do not grade cards ourselves and cannot authenticate third-party items; always review listings
            and grading standards directly with the seller or grader.
          </p>
        </Section>

        <Section title="Community & Roadmap">
          <ul>
            <li>
              <strong>Wishlists & Vault:</strong> track favorites and personal watch lists (rolling out).
            </li>
            <li>
              <strong>More sports & sets:</strong> expanding modern and vintage coverage, plus checklists.
            </li>
            <li>
              <strong>Richer pricing:</strong> more sources and longer time-series where permitted.
            </li>
            <li>
              <strong>Better images:</strong> de-duplicated, higher-resolution fronts/backs with credits.
            </li>
            <li>
              <strong>Seller tools:</strong> optional tools for inventory & listing prep (in exploration).
            </li>
          </ul>
        </Section>

        <Section title="How We Build">
          <p>
            Legendary Collectibles is crafted with a modern web stack focused on speed, reliability,
            and data integrity. We optimize pages for fast loading, use edge delivery for media,
            and continuously refine our import pipelines for accuracy.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            We love feedback, corrections, and ideas. Reach us anytime at{" "}
            <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="m-0 text-white/80">
              <strong>Mailing Address:</strong>
              <br />
              {ADDRESS_LINE_1}
              <br />
              {ADDRESS_LINE_2}
            </p>
          </div>

          <p className="mt-3">
            Found a data issue? Include the card/set URL and a short description so we can verify and fix it quickly.
          </p>
        </Section>

        <Section title="Disclaimers">
          <p>
            Legendary Collectibles is an independent project and is not affiliated with or endorsed by
            The Pokémon Company International, Wizards of the Coast, Konami, Panini, Topps, Upper Deck,
            or any other publisher or rights holder. All trademarks, logos, and brand names are the property
            of their respective owners.
          </p>
          <p className="mt-2">
            Images and data shown on this site are used under applicable terms, licenses, and fair-use guidelines.
            Pricing and availability are subject to change and are provided for informational purposes only.
            Nothing on this site constitutes financial advice or a guarantee of value.
          </p>
          <p className="mt-2 text-white/70">
            For shipping questions, returns, or order support, email{" "}
            <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>{" "}
            and include your order number when available.
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
            <Link href="/shop" className="text-sky-300 hover:underline">
              Shop →
            </Link>
          </div>

          <div className="mt-3 text-xs">
            © {year} Legendary Collectibles. All rights reserved. • {FULL_ADDRESS}
          </div>
        </footer>
      </div>
    </>
  );
}
