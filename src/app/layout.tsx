// src/app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
import Script from "next/script";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ConsoleBinder from "@/components/ConsoleBinder";
import { site } from "@/config/site";
import { cfUrl } from "@/lib/cf";
import { ClerkProvider } from "@clerk/nextjs";

// Fonts
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

// Background (Cloudflare Images)
const HERO_BG_CF_ID = "a4ced899-6410-44b5-df67-11761a85bc00";

// Google Analytics
const GA_ID = "G-X503QBJDZ7";

// Optional: search console verifications (set in env, keep blank if not used)
const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || "";
const BING_SITE_VERIFICATION = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION || "";

// ----- Metadata base -----
let metadataBase: URL | undefined;
try {
  metadataBase =
    typeof site?.url === "string" && site.url.length ? new URL(site.url) : undefined;
} catch (err) {
  console.error("RootLayout: invalid site.url:", site?.url, err);
  metadataBase = undefined;
}

// ----- Metadata -----
const defaultTitle = `${site.name} — Buy Pokémon, Yu-Gi-Oh!, MTG & Funko Pop`;
const template = `%s • ${site.shortName ?? site.name}`;

export const metadata: Metadata = {
  metadataBase,
  title: { default: defaultTitle, template },
  description: site?.description ?? "",

  // ✅ Site-wide robots policy: allow indexing
  // Private pages should override to noindex via generateMetadata().
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },

  // ✅ Good defaults; DON'T set canonical here
  alternates: {
    // canonical intentionally omitted (per-page only)
    languages: {
      "en-US": "/",
    },
  },

  openGraph: {
    type: "website",
    url: site?.url ?? undefined,
    siteName: site?.name ?? undefined,
    title: defaultTitle,
    description: site?.description ?? undefined,
    images: [
      {
        url: site?.ogImage ?? "/og-image.png",
        width: 1200,
        height: 630,
        alt: site?.name ?? "Legendary Collectibles",
      },
    ],
    locale: "en_US",
  },

  twitter: {
    card: "summary_large_image",
    site: site?.twitter ?? undefined,
    creator: site?.twitter ?? undefined,
    title: defaultTitle,
    description: site?.description ?? undefined,
    images: site?.ogImage ? [site.ogImage] : ["/og-image.png"],
  },

  icons: {
    icon: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },

  // ✅ Helps SERP context (don’t overstuff; keep it tight)
  keywords: [
    "Legendary Collectibles",
    "Pokemon cards",
    "Pokémon singles",
    "Yu-Gi-Oh cards",
    "MTG singles",
    "Magic: The Gathering",
    "Funko Pop",
    "Trading cards",
    "Collectibles shop",
    "Buy trading cards online",
  ],
  category: "ecommerce",
  applicationName: site?.name ?? undefined,

  // ✅ Verification tags (only included if env vars set)
  verification:
    GOOGLE_SITE_VERIFICATION || BING_SITE_VERIFICATION
      ? {
          google: GOOGLE_SITE_VERIFICATION || undefined,
          other: BING_SITE_VERIFICATION
            ? { "msvalidate.01": BING_SITE_VERIFICATION }
            : undefined,
        }
      : undefined,
};

// ✅ Viewport defaults (minor but correct)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

// ----- Layout -----
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // JSON-LD structured data (Organization + WebSite)
  // Keep it conservative and valid.
  const ldOrg = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    email: site.email,
    telephone: site.phone,
    logo: `${site.url}/logo.png`,
    sameAs: Object.values(site.socials || {}).filter(Boolean),
    address: site?.address?.street
      ? {
          "@type": "PostalAddress",
          streetAddress: site.address.street,
          addressLocality: site.address.locality,
          addressRegion: site.address.region,
          postalCode: site.address.postalCode,
          addressCountry: site.address.country,
        }
      : undefined,
  };

  const ldSite = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.name,
    url: site.url,
    potentialAction: {
      "@type": "SearchAction",
      target: `${site.url}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  // Optional: Store schema (only if you have business info)
  // Safe even if you don’t have ratings/reviews yet.
  const ldStore = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: site.name,
    url: site.url,
    image: site?.ogImage ?? `${site.url}/og-image.png`,
    telephone: site.phone,
    email: site.email,
    address: site?.address?.street
      ? {
          "@type": "PostalAddress",
          streetAddress: site.address.street,
          addressLocality: site.address.locality,
          addressRegion: site.address.region,
          postalCode: site.address.postalCode,
          addressCountry: site.address.country,
        }
      : undefined,
  };

  const bgSrc = cfUrl(HERO_BG_CF_ID, "hero") ?? undefined;

  return (
    <ClerkProvider>
      <html lang="en" className={inter.variable} suppressHydrationWarning>
        <head>
          {/* Perf: preconnect */}
          <link rel="preconnect" href="https://www.googletagmanager.com" />
          <link rel="preconnect" href="https://cdn.jsdelivr.net" />
          <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />

          {/* Remix Icons CDN */}
          <link
            href="https://cdn.jsdelivr.net/npm/remixicon/fonts/remixicon.css"
            rel="stylesheet"
          />
        </head>

        <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
          {/* Google Analytics (App Router friendly) */}
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { anonymize_ip: true });
            `}
          </Script>

          {/* Background image + overlays */}
          <div className="pointer-events-none fixed inset-0 -z-10">
            {bgSrc ? (
              <>
                <Image
                  src={bgSrc}
                  alt=""
                  fill
                  priority
                  className="object-cover brightness-[.85] saturate-150 contrast-120"
                />
                <div className="absolute inset-0 bg-neutral-950/55" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.35)_100%)]" />
              </>
            ) : null}
          </div>

          <ConsoleBinder />
          <Header />

          <main className="container mx-auto max-w-7xl px-4 py-8">{children}</main>

          <Footer />

          {/* Structured Data */}
          <Script
            id="ld-org"
            type="application/ld+json"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(ldOrg) }}
          />
          <Script
            id="ld-site"
            type="application/ld+json"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(ldSite) }}
          />
          <Script
            id="ld-store"
            type="application/ld+json"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(ldStore) }}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}
