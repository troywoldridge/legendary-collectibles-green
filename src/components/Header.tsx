"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { site } from "@/config/site";
import { cfUrl, CF_ACCOUNT_HASH, type Variant } from "@/lib/cf";

const LOGO_CF_ID =
  process.env.NEXT_PUBLIC_CF_LOGO_ID || "f7b75c90-dccb-4c37-e603-2bc749caaa00";

// Prefer a wide variant FIRST so CF doesn’t crop away the right side
const LOGO_VARIANTS: Variant[] = [
  "hero",          // 1600×400 (wide) — best for logos
  "public",
  "category",
  "card",
  "productThumb",
];
export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Press "/" to focus search
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

  // Build candidate logo URLs (Cloudflare variants → raw fallback)
  const logoCandidates = useMemo(() => {
    const list = LOGO_VARIANTS.map((v) => cfUrl(LOGO_CF_ID, v)).filter(Boolean) as string[];
    if (CF_ACCOUNT_HASH) {
      list.push(`https://imagedelivery.net/${CF_ACCOUNT_HASH}/${LOGO_CF_ID}/public`);
    }
    return list;
  }, []);

  const [logoIdx, setLogoIdx] = useState(0);
  const logoSrc = logoCandidates[logoIdx];

  // Avoid duplicate nav items
  const hasSets = site.nav.some((n) => n.href === "/categories/pokemon/sets");
  const hasCards = site.nav.some((n) => n.href === "/categories/pokemon/cards");

  return (
    <header className="sticky top-0 z-50 bg-transparent">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Single transparent row (no container background, no border) */}
        <div className="flex items-center gap-6 py-3">
          {/* Logo (no crop; unoptimized to keep it crisp) */}
          <div className="pl-1 shrink-0">
            <Link href="/" className="flex items-center">
              {logoSrc ? (
                <Image
                  src={logoSrc}
                  alt={`${site.shortName} logo`}
                  width={260}
                  height={104}
                  unoptimized
                  priority
                  className="h-16 w-auto object-contain"
                  onError={() =>
                    setLogoIdx((i) => (i + 1 < logoCandidates.length ? i + 1 : i))
                  }
                />
              ) : (
                <div className="h-16 w-16 rounded bg-sky-500" />
              )}
            </Link>
          </div>

          {/* Nav (transparent; no ring/border) */}
          <nav className="hidden md:flex items-center gap-7 text-[17px]">
            {site.nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`transition-colors ${
                  isActive(n.href)
                    ? "text-white font-semibold underline underline-offset-4"
                    : "text-white/85 hover:text-white"
                }`}
              >
                {n.label}
              </Link>
            ))}
            {!hasSets && (
              <Link
                href="/categories/pokemon/sets"
                className={`transition-colors ${
                  pathname.startsWith("/categories/pokemon/sets")
                    ? "text-white font-semibold underline underline-offset-4"
                    : "text-white/85 hover:text-white"
                }`}
              >
                Pokémon Sets
              </Link>
            )}
            {!hasCards && (
              <Link
                href="/categories/pokemon/cards"
                className={`transition-colors ${
                  pathname.startsWith("/categories/pokemon/cards")
                    ? "text-white font-semibold underline underline-offset-4"
                    : "text-white/85 hover:text-white"
                }`}
              >
                Pokémon Cards
              </Link>
            )}
          </nav>

          {/* Search chip (only element with glass) */}
          <div className="ml-auto flex items-center">
            <form
              className="
                hidden md:flex items-center overflow-hidden
                rounded-2xl bg-white/10 backdrop-blur-xl
                px-2 py-1
              "
              onSubmit={(e) => {
                e.preventDefault();
                const query = q.trim();
                if (query) {
                  router.push(
                    `/categories/pokemon/cards?q=${encodeURIComponent(query)}&page=1`
                  );
                }
              }}
            >
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder='Search… (Press "/")'
                className="
                  w-[360px] lg:w-[500px]
                  bg-transparent border-0 outline-none
                  px-3 py-2 text-base text-white placeholder:text-white/70
                "
              />
              <button
                type="submit"
                className="rounded-xl bg-white/10 px-4 py-2 text-base font-medium text-white hover:bg-white/20"
              >
                Search
              </button>
            </form>

            {/* Mobile shortcut */}
            <Link
              href="/categories/pokemon/cards"
              className="md:hidden inline-flex items-center gap-1 rounded-2xl bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur-xl hover:bg-white/20"
            >
              🔍 Search
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
