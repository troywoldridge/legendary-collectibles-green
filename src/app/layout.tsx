// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
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

// ----- Metadata -----
const title = `${site.name} — Buy Pokémon, Yu-Gi-Oh!, MTG & Funko Pop`;
const template = "%s • " + (site.shortName ?? site.name);

let metadataBase: URL | undefined;
try {
  metadataBase =
    typeof site?.url === "string" && site.url.length ? new URL(site.url) : undefined;
} catch (err) {
  console.error("RootLayout: invalid site.url:", site?.url, err);
  metadataBase = undefined;
}

export const metadata: Metadata = {
  metadataBase,
  title: { default: title, template },
  description: site?.description ?? "",

  // IMPORTANT:
  // Do NOT set a site-wide canonical here.
  // Canonicals must be per-page (via metadata/generateMetadata),
  // otherwise Google will treat many pages as duplicates of the homepage.

  openGraph: {
    type: "website",
    url: site?.url ?? undefined,
    siteName: site?.name ?? undefined,
    title,
    description: site?.description ?? undefined,
    images: [
      {
        url: site?.ogImage ?? "/og-image.png",
        width: 1200,
        height: 630,
        alt: site?.name ?? "",
      },
    ],
    locale: "en_US",
  },

  twitter: {
    card: "summary_large_image",
    site: site?.twitter ?? undefined,
    creator: site?.twitter ?? undefined,
    title,
    description: site?.description ?? undefined,
    images: site?.ogImage ? [site.ogImage] : [],
  },
  icons: {
    icon: [{ url: "/favicon.ico" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  keywords: [
    "pokemon",
    "pokémon cards",
    "yu-gi-oh",
    "mtg",
    "magic the gathering",
    "funko pop",
    "booster boxes",
    "elite trainer box",
    "commander deck",
    "trading cards",
    "collectibles shop",
  ],
  category: "ecommerce",
  applicationName: site?.name ?? undefined,
};

// ----- Layout -----
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // JSON-LD
  const ldOrg = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    email: site.email,
    telephone: site.phone,
    logo: `${site.url}/logo.png`,
    sameAs: Object.values(site.socials || {}).filter(Boolean),
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.street,
      addressLocality: site.address.locality,
      addressRegion: site.address.region,
      postalCode: site.address.postalCode,
      addressCountry: site.address.country,
    },
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

  const bgSrc = cfUrl(HERO_BG_CF_ID, "hero") ?? undefined;

  return (
    <ClerkProvider>
      <html lang="en" className={inter.variable}>
        <head>
          {/* Remix Icons CDN */}
          <link
            href="https://cdn.jsdelivr.net/npm/remixicon/fonts/remixicon.css"
            rel="stylesheet"
          />

          {/* Google tag (gtag.js) — MUST be plain script so Google can detect it */}
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
          <script
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');
              `,
            }}
          />
        </head>

        <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
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
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(ldOrg) }}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(ldSite) }}
          />
        </body>
      </html>
    </ClerkProvider>
  );
}
