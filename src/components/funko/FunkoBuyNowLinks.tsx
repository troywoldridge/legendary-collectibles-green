// src/components/funko/FunkoBuyNowLinks.tsx
import Link from "next/link";

type Props = {
  name: string;
  franchise?: string | null;
  series?: string | null;
  number?: string | null;
  upc?: string | null;
};

function q(parts: (string | null | undefined)[]) {
  return encodeURIComponent(parts.filter(Boolean).join(" ").trim());
}

function btn() {
  return "rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white/85 hover:bg-white/10";
}

export default function FunkoBuyNowLinks({ name, franchise, series, number, upc }: Props) {
  const query = upc?.trim()
    ? q([upc])
    : q([name, franchise ?? null, series ?? null, number ? `#${number}` : null]);

  const links = [
    { label: "Shop on Funko", href: `https://funko.com/search?q=${query}` },
    { label: "Shop on eBay", href: `https://www.ebay.com/sch/i.html?_nkw=${query}` },
    { label: "Shop on Amazon", href: `https://www.amazon.com/s?k=${query}` },
    { label: "Check Whatnot", href: `https://www.whatnot.com/search?query=${query}` },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className={btn()} target="_blank" rel="nofollow noopener noreferrer">
          🛒 {l.label}
        </Link>
      ))}
    </div>
  );
}
