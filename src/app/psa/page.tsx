// src/app/psa/page.tsx
import "server-only";
import type { Metadata } from "next";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PSA Grading Guide & Certification • Legendary Collectibles",
  description:
    "Learn what PSA grading means, how PSA grades 1–10 work, and how to verify a PSA certification number. Shop Pokémon, Yu-Gi-Oh!, and MTG cards with confidence.",
};

function CardLink({
  href,
  title,
  desc,
  badge,
}: {
  href: string;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="not-prose block rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold">{title}</div>
        {badge ? (
          <span className="text-xs px-2 py-1 rounded-full border border-white/15 bg-white/5 opacity-90">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-sm opacity-80">{desc}</div>
    </Link>
  );
}

export default function Page() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      {/* HERO */}
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          PSA Graded Cards &amp; Certification
        </h1>
        <p className="mt-3 max-w-3xl text-base opacity-85">
          PSA grading is one of the most trusted standards for evaluating the condition and
          authenticity of trading cards. Use this hub to learn PSA grades, shop confidently,
          and (soon) verify PSA certification numbers.
        </p>

        {/* QUICK ACTIONS */}
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <CardLink
            href="/guides/what-is-psa-grading"
            title="Learn PSA grading"
            desc="PSA 1–10 explained in plain English."
          />
          <CardLink
            href="/psa/verify"
            title="Verify a PSA cert"
            desc="Check details by cert number."
            badge="Coming next"
          />
          <CardLink
            href="/shop"
            title="Shop listings"
            desc="Browse cards across Pokémon, YGO & MTG."
          />
        </div>
      </header>

      {/* CONTENT */}
      <article className="prose prose-invert max-w-none">
        <h2>What is PSA grading?</h2>
        <p>
          PSA grading evaluates trading cards based on centering, corners, edges, and surface condition.
          Each card receives a grade from <strong>PSA 1 (Poor)</strong> to <strong>PSA 10 (Gem Mint)</strong> and
          is sealed in a tamper-resistant holder with a unique certification number.
        </p>

        <ul>
          <li><strong>Trust:</strong> standardizes condition beyond photos</li>
          <li><strong>Protection:</strong> helps preserve high-value cards</li>
          <li><strong>Value clarity:</strong> makes pricing easier to compare</li>
        </ul>

        <p>
          New to grading?{" "}
          <Link href="/guides/what-is-psa-grading">
            Start with our beginner guide
          </Link>
          .
        </p>

        <hr />

        <h2>Guides</h2>
        <p>Short, collector-friendly reads. No hype, just useful info.</p>

        <div className="not-prose grid gap-3 sm:grid-cols-2">
          <CardLink
            href="/guides/what-is-psa-grading"
            title="What is PSA grading?"
            desc="How grading works and what PSA looks for."
          />
          <CardLink
            href="/guides/psa-9-vs-psa-10"
            title="PSA 9 vs PSA 10"
            desc="When the premium is worth it (and when it isn’t)."
            badge="Placeholder"
          />
          <CardLink
            href="/guides/psa-vs-bgs-vs-cgc"
            title="PSA vs BGS vs CGC"
            desc="Which grading company makes sense for your goals."
            badge="Placeholder"
          />
          <CardLink
            href="/guides"
            title="All guides"
            desc="Browse the full guide library."
          />
        </div>

        <hr />

        <h2>Shop by game</h2>
        <p>
          Browse cards and sets across the major TCGs. Graded and raw live side-by-side so you can choose what fits
          your collection.
        </p>

        <h3>Pokémon</h3>
        <ul>
          <li><Link href="/categories/pokemon/cards">Pokémon Cards</Link></li>
          <li><Link href="/categories/pokemon/sets">Pokémon Sets</Link></li>
        </ul>

        <h3>Yu-Gi-Oh!</h3>
        <ul>
          <li><Link href="/categories/yugioh/cards">Yu-Gi-Oh! Cards</Link></li>
          <li><Link href="/categories/yugioh/sets">Yu-Gi-Oh! Sets</Link></li>
        </ul>

        <h3>Magic: The Gathering</h3>
        <ul>
          <li><Link href="/categories/mtg/cards">MTG Cards</Link></li>
          <li><Link href="/categories/mtg/sets">MTG Sets</Link></li>
        </ul>

        <p>
          Want everything? <Link href="/shop">View all listings</Link>.
        </p>

        <hr />

        <h2>Manage &amp; track your collection</h2>
        <p>
          Already collecting? Track cards, grades, and value over time in your account.
        </p>

        <ul>
          <li>Add graded and raw cards</li>
          <li>Monitor condition-based value</li>
          <li>Keep your collection organized in one place</li>
        </ul>

        <p>
          <Link href="/collection">Go to My Collection</Link>
        </p>

        <hr />

        <h2>Quick FAQ</h2>
        <dl>
          <dt>Is PSA grading worth it?</dt>
          <dd>
            Usually for higher-value cards in strong condition. For low-value cards or obvious damage, it often isn’t.
          </dd>

          <dt>Does PSA guarantee authenticity?</dt>
          <dd>
            PSA evaluates authenticity as part of the process, but you should still verify cert details and buy from
            reputable sources.
          </dd>

          <dt>Why are PSA 10 cards so expensive?</dt>
          <dd>
            Because they’re hard to achieve consistently—especially for older sets or print-sensitive cards.
          </dd>
        </dl>

        <p>
          Next up, we’ll publish the full decision guide:{" "}
          <Link href="/guides/psa-9-vs-psa-10">PSA 9 vs PSA 10</Link>.
        </p>
      </article>
    </main>
  );
}
