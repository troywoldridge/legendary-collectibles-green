// src/app/guides/page.tsx
import "server-only";
import type { Metadata } from "next";
import Link from "next/link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collector Guides • Legendary Collectibles",
  description:
    "Straightforward guides for TCG collectors—PSA grading, card condition, variants, and smart buying decisions for Pokémon, Yu-Gi-Oh!, and MTG.",
};

export default function Page() {
  return (
    <article className="prose prose-invert max-w-3xl mx-auto px-4 py-10">
      <h1>Collector Guides</h1>

      <p>
        Learn the stuff that actually matters: grading, condition, variants, and how collectors think about value.
        No hype, just useful guides you can reference anytime.
      </p>

      <h2>PSA &amp; Grading</h2>
      <ul>
        <li>
          <Link href="/guides/what-is-psa-grading">What Is PSA Grading? (PSA 1–10 Explained)</Link>
          <br />
          <small>How grading works, what PSA looks for, and when it’s worth it.</small>
        </li>
        <li>
          <Link href="/guides/psa-9-vs-psa-10">PSA 9 vs PSA 10: Is the Price Difference Worth It?</Link>
          <br />
          <small>Coming next.</small>
        </li>
        <li>
          <Link href="/guides/psa-vs-bgs-vs-cgc">PSA vs BGS vs CGC: Which Grading Company Is Best?</Link>
          <br />
          <small>Coming soon.</small>
        </li>
      </ul>

      <h2>Shop by Game</h2>
      <ul>
        <li>
          Pokémon:{" "}
          <Link href="/categories/pokemon/cards">Cards</Link> ·{" "}
          <Link href="/categories/pokemon/sets">Sets</Link>
        </li>
        <li>
          Yu-Gi-Oh!:{" "}
          <Link href="/categories/yugioh/cards">Cards</Link> ·{" "}
          <Link href="/categories/yugioh/sets">Sets</Link>
        </li>
        <li>
          MTG:{" "}
          <Link href="/categories/mtg/cards">Cards</Link> ·{" "}
          <Link href="/categories/mtg/sets">Sets</Link>
        </li>
      </ul>

      <p>
        Want the PSA hub? <Link href="/psa">Start here.</Link>
      </p>
    </article>
  );
}
