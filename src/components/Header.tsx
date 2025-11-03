"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { site } from "@/config/site";
import { cfUrl, CF_ACCOUNT_HASH, type Variant } from "@/lib/cf";

const LOGO_CF_ID =
  process.env.NEXT_PUBLIC_CF_LOGO_ID || "f7b75c90-dccb-4c37-e603-2bc749caaa00";

// Prefer a wide variant first so CF doesn’t crop the right side
const LOGO_VARIANTS: Variant[] = ["hero", "public", "category", "card", "productThumb"];

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus search with "/"
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLSelectElement;
      if (e.key === "/" && !inField) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  // Cloudflare Image URL fallbacks for the logo
  const logoCandidates = useMemo(() => {
    const list = LOGO_VARIANTS.map((v) => cfUrl(LOGO_CF_ID, v)).filter(Boolean) as string[];
    if (CF_ACCOUNT_HASH) {
      list.push(`https://imagedelivery.net/${CF_ACCOUNT_HASH}/${LOGO_CF_ID}/public`);
    }
    return list;
  }, []);
  const [logoIdx, setLogoIdx] = useState(0);
  const logoSrc = logoCandidates[logoIdx];

  // Explicit, condensed nav order
  const nav = [
    { href: "/", label: "Home" },
    { href: "/categories/pokemon/sets", label: "Pokémon Sets" },
    { href: "/categories/pokemon/cards", label: "Pokémon Cards" },
    { href: "/categories/yugioh/sets", label: "Yu-Gi-Oh! Sets" },
    { href: "/categories/yugioh/cards", label: "Yu-Gi-Oh! Cards" },
    { href: "/categories/magic/sets", label: "MTG Sets" },
    { href: "/categories/magic/cards", label: "MTG Cards" },
    { href: "/categories/sports-cards", label: "Sports Cards" },
    // 🔧 Fixed: link directly to the real Funko route
    { href: "/categories/funko/sets", label: "Funko Pop" },
  ] as const;

  // Small helper: send searches to the most relevant section
  const searchBase = pathname.startsWith("/categories/yugioh")
    ? "/categories/yugioh/cards"
    : pathname.startsWith("/categories/magic")
    ? "/categories/magic/cards"
    : "/categories/pokemon/cards";

  return (
    <header className="sticky top-0 z-50 bg-transparent">
      {/* Full-width bar */}
      <div className="w-full px-3 sm:px-4 lg:px-6">
        <div className="flex w-full items-center justify-between gap-2 py-2">
          {/* Logo */}
          <div className="shrink-0">
            <Link href="/" aria-label={`${site.shortName} Home`} className="flex items-center">
              {logoSrc ? (
                <Image
                  src={logoSrc}
                  alt={`${site.shortName} logo`}
                  width={210}
                  height={84}
                  unoptimized
                  priority
                  className="h-12 w-auto object-contain sm:h-14"
                  onError={() =>
                    setLogoIdx((i) => (i + 1 < logoCandidates.length ? i + 1 : i))
                  }
                />
              ) : (
                <div className="h-12 w-12 rounded bg-sky-500" />
              )}
            </Link>
          </div>

          {/* Nav: shrinks if tight; scrolls horizontally if still overflowing */}
          <nav className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap no-scrollbar">
            <div className="flex items-center gap-4 md:gap-5 text-[14px] md:text-[15px]">
              {nav.map((n) => {
                const active = isActive(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={`transition-colors ${
                      active
                        ? "text-white font-semibold underline underline-offset-4"
                        : "text-white/85 hover:text-white"
                    }`}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Compact Search */}
          <div className="ml-2 flex items-center">
            <form
              className="hidden md:flex items-center overflow-hidden rounded-2xl bg-white/10 backdrop-blur-xl px-2 py-1"
              onSubmit={(e) => {
                e.preventDefault();
                const query = q.trim();
                if (query) router.push(`${searchBase}?q=${encodeURIComponent(query)}&page=1`);
              }}
            >
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder='Search… (press “/”)'
                aria-label="Search cards"
                className="w-[200px] lg:w-[260px] xl:w-[300px] bg-transparent border-0 outline-none px-3 py-1.5 text-sm text-white placeholder:text-white/70"
              />
              <button
                type="submit"
                className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
              >
                Search
              </button>
            </form>

            {/* Mobile shortcut */}
            <Link
              href={searchBase}
              className="md:hidden inline-flex items-center gap-1 rounded-2xl bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur-xl hover:bg-white/20"
            >
              🔍 Search
            </Link>
          </div>
        </div>
      </div>

      {/* Hide nav scrollbar visually (keeps scrollability) */}
      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </header>
  );
}
