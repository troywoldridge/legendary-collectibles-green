"use client";

import Link from "next/link";

type Props = {
  /** Full Amazon affiliate URL – if missing, CTA renders nothing */
  url?: string | null;
  /** Human label, usually the card name */
  label?: string | null;

  /** Kept for compatibility with older call sites – ignored for now */
  category?: string;
  cardId?: string;
  cardName?: string | null;
};

export default function CardAmazonCTA(props: Props) {
  const url = props.url;
  const label = props.label ?? props.cardName ?? "This card";

  if (!url) {
    // No URL passed from the server → hide CTA
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 shadow-lg shadow-amber-500/15">
      <div className="text-xs uppercase tracking-wide text-amber-200/80">
        Amazon Affiliate
      </div>
      <div className="mt-1 text-sm text-white/90">
        Support the site by buying{" "}
        <span className="font-semibold">{label}</span> on Amazon.
      </div>
      <div className="mt-3">
        <Link
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-black hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
        >
          View on Amazon
          <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </div>
  );
}
