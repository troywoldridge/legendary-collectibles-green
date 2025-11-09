"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { site } from "@/config/site";
import { cfUrl, CF_ACCOUNT_HASH, type Variant } from "@/lib/cf";
import { FEATURES } from "@/config/flags";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";

type NavItem = { href: string; label: string };

const LOGO_CF_ID =
  process.env.NEXT_PUBLIC_CF_LOGO_ID || "f7b75c90-dccb-4c37-e603-2bc749caaa00";

// Prefer a wide variant first so CF doesn’t crop the right side
const LOGO_VARIANTS: Variant[] = ["hero", "public", "category", "card", "productThumb"];

export default function Header() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href));

  // Cloudflare Image URL fallbacks for the logo
  const logoCandidates = useMemo(() => {
    const list = LOGO_VARIANTS.map((v) => cfUrl(LOGO_CF_ID, v)).filter(Boolean) as string[];
    if (CF_ACCOUNT_HASH) {
      list.push(`https://imagedelivery.net/${CF_ACCOUNT_HASH}/${LOGO_CF_ID}/public`);
    }
    // final fallback to local asset
    list.push("/logo.png");
    return list;
  }, []);
  const [logoIdx, setLogoIdx] = useState(0);
  const logoSrc = logoCandidates[logoIdx];

  // Build the nav (conditionally include Funko)
  const nav: NavItem[] = [
    { href: "/", label: "Home" },
    { href: "/categories/pokemon/sets", label: "Pokémon Sets" },
    { href: "/categories/pokemon/cards", label: "Pokémon Cards" },
    { href: "/categories/yugioh/sets", label: "Yu-Gi-Oh! Sets" },
    { href: "/categories/yugioh/cards", label: "Yu-Gi-Oh! Cards" },
    { href: "/categories/magic/sets", label: "MTG Sets" },
    { href: "/categories/magic/cards", label: "MTG Cards" },
    // { href: "/categories/sports/cards", label: "Sports Cards" },
  ];
  if (FEATURES.funko) nav.push({ href: "/categories/funko/sets", label: "Funko Pop" });

  return (
    <header className="sticky top-0 z-50 bg-transparent">
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

          {/* Nav */}
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

          {/* Auth (no search) */}
          <div className="ml-2 flex items-center gap-2">
            <SignedOut>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="h-9 rounded-md border border-white/20 bg-white/10 px-3 text-sm text-white hover:bg-white/15"
                >
                  Log in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="h-9 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-500"
                >
                  Sign up
                </button>
              </SignUpButton>
            </SignedOut>

            <SignedIn>
              <Link
                href="/collections"
                className="hidden sm:inline-flex h-9 items-center rounded-md border border-white/20 bg-white/10 px-3 text-sm text-white hover:bg-white/15"
              >
                My Collections
              </Link>
              <UserButton
                appearance={{ elements: { userButtonAvatarBox: "ring-2 ring-white/30" } }}
                userProfileMode="modal"
                afterSignOutUrl="/"
              />
            </SignedIn>
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
