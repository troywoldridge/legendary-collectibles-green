// src/app/guides/what-is-psa-grading/page.tsx
import "server-only";
import type { Metadata } from "next";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "What Is PSA Grading? (PSA 1–10 Explained) • Legendary Collectibles",
  description:
    "A collector-friendly explanation of PSA grading: what the grades mean, what PSA looks for, how grading affects value, and when grading is worth it.",
};

export default function Page() {
  return (
    <article className="prose prose-invert max-w-3xl mx-auto px-4 py-10">
      <p className="text-sm opacity-70">
        <Link href="/guides">Guides</Link> → <Link href="/psa">PSA</Link>
      </p>

      <h1>What Is PSA Grading? PSA 1–10 Explained for Collectors</h1>

      <p>
        PSA grading is a professional process that evaluates a trading card’s{" "}
        <strong>condition</strong> and usually confirms it’s <strong>authentic</strong>.
        PSA then assigns a grade from <strong>1 to 10</strong> and seals the card in a tamper-resistant holder
        (a “slab”) with a unique certification number.
      </p>

      <p>
        If you’ve ever wondered why two copies of the same card can sell for wildly different prices, grading is a huge
        part of the answer.
      </p>

      <h2>Why collectors grade cards</h2>
      <ul>
        <li><strong>Trust:</strong> buyers can rely on a standard, not just photos.</li>
        <li><strong>Protection:</strong> slabs help preserve condition long-term.</li>
        <li><strong>Value clarity:</strong> grade creates a common “language” for pricing.</li>
      </ul>

      <p>
        If you’re brand new, start with the PSA hub and come back: <Link href="/psa">PSA Grading &amp; Certification</Link>.
      </p>

      <h2>PSA grades 1–10 in plain English</h2>
      <p>Here’s how most collectors interpret the grades in real life:</p>

      <ul>
        <li><strong>PSA 10 (Gem Mint):</strong> near flawless; premium grade.</li>
        <li><strong>PSA 9 (Mint):</strong> tiny imperfections; often the best value buy.</li>
        <li><strong>PSA 8 (NM-MT):</strong> light wear; still very displayable.</li>
        <li><strong>PSA 7 (Near Mint):</strong> noticeable wear (whitening, small surface marks).</li>
        <li><strong>PSA 6 and below:</strong> increasing wear; dents/creases can push grades lower fast.</li>
      </ul>

      <p>
        In general: PSA 10 is the trophy, PSA 9 is the “smart premium,” and PSA 7–8 can be awesome for vintage or
        tougher-to-grade cards.
      </p>

      <h2>What PSA actually looks at</h2>
      <p>PSA grading is usually about four main areas:</p>

      <h3>1) Centering</h3>
      <p>
        How balanced the borders are left-to-right and top-to-bottom. Poor centering can cap a grade even if the rest
        of the card looks clean.
      </p>

      <h3>2) Corners</h3>
      <p>
        Whitening, rounding, or tiny dings are common grade killers. Sharp corners matter a lot for PSA 10 potential.
      </p>

      <h3>3) Edges</h3>
      <p>
        Chipping and edge wear show up often on older cards and foil cards. Edges are one of the first places wear
        becomes obvious.
      </p>

      <h3>4) Surface</h3>
      <p>
        Scratches, print lines, scuffs, dents, stains, and indents are all surface issues. On holo/foil cards, surface
        condition is a big deal.
      </p>

      <h2>How grading affects value</h2>
      <p>
        Grading doesn’t magically make a card “better,” but it creates a trusted benchmark. That benchmark can increase
        demand and reduce buyer hesitation—especially for higher-value singles.
      </p>

      <p>
        The biggest value jumps typically happen when:
      </p>
      <ul>
        <li>The card is already desirable (popular character, competitive staple, vintage, low population, etc.)</li>
        <li>The condition is strong enough to earn a high grade (often PSA 9/10)</li>
        <li>Raw copies are risky (counterfeits, hard-to-photo flaws, frequent surface issues)</li>
      </ul>

      <h2>When is grading worth it?</h2>
      <p>
        A simple way to think about it:
      </p>
      <ul>
        <li>
          Grade when the card is <strong>valuable, in great condition, and easy to sell</strong>.
        </li>
        <li>
          Skip grading when the card is <strong>low value</strong> or has obvious flaws (crease, dent, heavy whitening).
        </li>
      </ul>

      <p>
        Next guide we’ll publish:{" "}
        <Link href="/guides/psa-9-vs-psa-10">PSA 9 vs PSA 10: is the price difference worth it?</Link>
      </p>

      <h2>How PSA certification numbers help</h2>
      <p>
        PSA slabs include a certification number you can use to verify details. This reduces risk when buying graded
        cards and helps confirm you’re looking at the right item.
      </p>

      <p>
        We’ll have a verifier page here soon: <Link href="/psa/verify">/psa/verify</Link>.
      </p>

      <h2>FAQ</h2>
      <dl>
        <dt>Is PSA grading the best?</dt>
        <dd>
          PSA is one of the most recognized graders in the hobby. “Best” depends on what you collect and what the market
          values most for that card type.
        </dd>

        <dt>Is PSA 9 much worse than PSA 10?</dt>
        <dd>
          Not “worse,” just less perfect. PSA 9 can be a great buy if PSA 10 is priced out of reach.
        </dd>

        <dt>Why are PSA 10s so expensive?</dt>
        <dd>
          PSA 10s are harder to achieve consistently, especially for older sets or print-sensitive cards.
        </dd>
      </dl>

      <h2>Keep exploring</h2>
      <ul>
        <li>
          Start at the PSA hub: <Link href="/psa">PSA Grading &amp; Certification</Link>
        </li>
        <li>
          Browse Pokémon: <Link href="/categories/pokemon/cards">Cards</Link> ·{" "}
          <Link href="/categories/pokemon/sets">Sets</Link>
        </li>
        <li>
          Browse Yu-Gi-Oh!: <Link href="/categories/yugioh/cards">Cards</Link> ·{" "}
          <Link href="/categories/yugioh/sets">Sets</Link>
        </li>
        <li>
          Browse MTG: <Link href="/categories/mtg/cards">Cards</Link> ·{" "}
          <Link href="/categories/mtg/sets">Sets</Link>
        </li>
        <li>
          View all listings: <Link href="/shop">Shop</Link>
        </li>
      </ul>
    </article>
  );
}
