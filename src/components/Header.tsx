"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useMemo, useState } from "react";
import { site } from "@/config/site";
import { cfUrl, CF_ACCOUNT_HASH, type Variant } from "@/lib/cf";
import { FEATURES } from "@/config/flags";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { useCartCount } from "@/hooks/useCartCount";


const LOGO_CF_ID = "f7b75c90-dccb-4c37-e603-2bc749caaa00";

/**
 * IMPORTANT:
 * Use the wide logo variant first so the "LEGENDARY COLLECTIBLES" text stays readable.
 * hero = 1600x400 (perfect ratio for this logo)
 */
const LOGO_VARIANTS: Variant[] = ["hero"];

export default function Header() {
  const pathname = usePathname();
const cartCount = useCartCount();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href));

  // Logo fallbacks (FORCE hero first)
  const logoCandidates = useMemo(() => {
    const list: string[] = [];

    // 1) Try helper (if it returns something)
    const fromHelper = cfUrl(LOGO_CF_ID, "hero");
    if (fromHelper) list.push(fromHelper);

    // 2) Hard-force CF hero/public if we have the account hash
    if (CF_ACCOUNT_HASH) {
      list.push(`https://imagedelivery.net/${CF_ACCOUNT_HASH}/${LOGO_CF_ID}/hero`);
      list.push(`https://imagedelivery.net/${CF_ACCOUNT_HASH}/${LOGO_CF_ID}/public`);
    }

    // 3) Local fallback
    list.push("/logo.png");

    return list;
  }, []);

  const [logoIdx, setLogoIdx] = useState(0);
  const logoSrc = logoCandidates[logoIdx];

  return (
    <header className="site-header-glass sticky top-0 z-50">
      <div className="mx-auto max-w-[1400px] px-3 sm:px-4 lg:px-6">
        {/* Main header row */}
        <div className="flex items-center gap-4 px-3 py-2.5 sm:gap-6 sm:px-4 lg:px-6 lg:py-3">
          {/* Logo */}
          <Link
            href="/"
            aria-label={`${site.shortName} Home`}
            className="shrink-0 transition-opacity hover:opacity-80"
          >
            {logoSrc ? (
              <div className="relative h-12 w-[520px] sm:h-14 sm:w-[620px] lg:h-16 lg:w-[720px]">
                <Image
                  src={logoSrc}
                  alt={site.name}
                  fill
                  sizes="(max-width: 640px) 520px, (max-width: 1024px) 620px, 720px"
                  unoptimized
                  priority
                  className="object-contain object-left drop-shadow-[0_6px_18px_rgba(0,0,0,0.65)] brightness-110"
                  onError={() =>
                    setLogoIdx((i) => (i + 1 < logoCandidates.length ? i + 1 : i))
                  }
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-linear-to-br from-indigo-500 to-purple-600 sm:h-12 sm:w-12 lg:h-14 lg:w-14" />
                <span className="text-lg font-bold text-white sm:text-xl lg:text-2xl">
                  {site.shortName}
                </span>
              </div>
            )}
          </Link>

          {/* Search bar - desktop */}
          <div className="hidden flex-1 lg:block">
            <form className="relative max-w-2xl">
              <input
                type="search"
                placeholder="Search cards, sets, or products..."
                className="h-11 w-full rounded-xl border border-white/15 bg-white/5 px-4 pr-12 text-sm text-white placeholder:text-white/50
                           focus:border-indigo-500 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Search
              </button>
            </form>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-3 lg:gap-4">
            {/* Cart */}
            <Link
              href="/cart"
              className="group relative flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 transition-colors hover:bg-white/10 lg:px-4"
            >
              <svg
                className="h-5 w-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              {cartCount > 0 && (
  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
    {cartCount}
  </span>
)}

            </Link>

            {/* Auth */}
            <SignedOut>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="hidden h-10 items-center rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-medium text-white transition-colors hover:bg-white/10 lg:flex"
                >
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>

            <SignedIn>
              <UserButton
                appearance={{
                  elements: { userButtonAvatarBox: "h-10 w-10 ring-2 ring-white/25" },
                }}
                userProfileMode="modal"
                afterSignOutUrl="/"
              />
            </SignedIn>

            {/* Mobile menu button (visual only for now) */}
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 lg:hidden"
              aria-label="Open menu"
            >
              <svg
                className="h-5 w-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Navigation bar - desktop */}
        <nav className="hidden border-t border-white/10 lg:block">
          <div className="flex items-center gap-1 px-3 sm:px-4 lg:px-6">
            <NavLink href="/" active={isActive("/")}>
              Home
            </NavLink>

            <NavDropdown label="Pokémon">
              <DropdownLink href="/categories/pokemon/sets">Pokémon Sets</DropdownLink>
              <DropdownLink href="/categories/pokemon/cards">Pokémon Cards</DropdownLink>
            </NavDropdown>

            <NavDropdown label="Yu-Gi-Oh!">
              <DropdownLink href="/categories/yugioh/sets">Yu-Gi-Oh! Sets</DropdownLink>
              <DropdownLink href="/categories/yugioh/cards">Yu-Gi-Oh! Cards</DropdownLink>
            </NavDropdown>

            <NavDropdown label="Magic: The Gathering">
              <DropdownLink href="/categories/mtg/sets">MTG Sets</DropdownLink>
              <DropdownLink href="/categories/mtg/cards">MTG Cards</DropdownLink>
            </NavDropdown>

            <NavDropdown label="Funko">
              <DropdownLink href="/categories/funko/items">Funko</DropdownLink>
            </NavDropdown>

            <NavLink href="/psa" active={isActive("/psa")}>
              PSA
            </NavLink>

            <NavLink href="/shop" active={isActive("/shop")}>
              Shop
            </NavLink>

            <NavLink href="/collection" active={isActive("/collection")}>
              My Collection
            </NavLink>
          </div>
        </nav>

        {/* Search bar - mobile */}
        <div className="border-t border-white/10 px-3 py-3 sm:px-4 lg:hidden">
          <form className="relative">
            <input
              type="search"
              placeholder="Search..."
              className="h-10 w-full rounded-xl border border-white/15 bg-white/5 px-4 pr-10 text-sm text-white placeholder:text-white/50
                         focus:border-indigo-500 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <button
              type="submit"
           
   className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-white/80 hover:text-white"
              aria-label="Search"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 2 2 0 0114 0z"
                />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "group relative flex h-12 items-center px-4 text-sm font-medium",
        "transition-all duration-200",
        "rounded-lg",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
        active ? "text-white bg-white/6" : "text-white/80 hover:text-white hover:bg-white/6",
      ].join(" ")}
    >
      {children}
      <span
        className={[
          "pointer-events-none absolute left-3 right-3 bottom-1 h-0.5 rounded-full",
          "transition-all duration-200",
          active
            ? "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.65)] opacity-100"
            : "bg-white/20 opacity-0 group-hover:opacity-100",
        ].join(" ")}
      />
    </Link>
  );
}

function NavDropdown({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="group relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="flex h-12 items-center gap-1 px-4 text-sm font-medium text-white/80 transition-colors hover:text-white">
        {label}
        <svg
          className={`h-4 w-4 transition-transform duration-200 ${
            open ? "rotate-180" : "group-hover:translate-y-px"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 min-w-[200px] overflow-hidden rounded-xl border border-white/12 bg-white/6 backdrop-blur-xl shadow-xl">
          <div className="py-2">{children}</div>
        </div>
      )}
    </div>
  );
}

function DropdownLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block px-4 py-2.5 text-sm text-white/80 transition-all duration-150 hover:bg-white/8 hover:text-white"
    >
      {children}
    </Link>
  );
}
