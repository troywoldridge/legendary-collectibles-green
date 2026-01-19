// src/lib/seo.ts
import type { Metadata } from "next";
import { site } from "@/config/site";

/** Helper to safely resolve absolute URLs from a path */
export function absoluteUrl(path = ""): string {
  const base = site.url?.replace(/\/+$/, "") || "";
  const clean = `/${String(path || "").replace(/^\/+/, "")}`;
  return `${base}${clean}`;
}

// Safely compute metadataBase
function getMetadataBase(): URL | undefined {
  try {
    return site.url ? new URL(site.url) : undefined;
  } catch {
    return undefined;
  }
}

function absoluteImageUrl(image?: string): string {
  return absoluteUrl(image || site.ogImage || "/og-image.jpg");
}

export const baseMetadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: { default: site.name, template: `%s • ${site.shortName}` },
  description: site.description,
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: site.name,
    title: site.name,
    description: site.description,
    url: site.url,
    images: [
      {
        url: absoluteImageUrl(),
        width: 1200,
        height: 630,
        alt: site.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: site.twitter || site.url,
    creator: site.twitter || site.name,
    images: [absoluteImageUrl()],
  },
};

export function getProductMetadata({
  name,
  description,
  image,
  price,
  currency = "USD",
  sku,
  url,
}: {
  name: string;
  description: string;
  image?: string;
  price?: number;
  currency?: string;
  sku?: string;
  url?: string;
}): Metadata {
  const absUrl = url ? absoluteUrl(url) : site.url;
  const img = absoluteImageUrl(image);

  // Build “other” meta safely and with proper typing
  const other: Record<string, string> = {};
  if (price != null) other["product:price:amount"] = String(price);
  if (currency) other["product:price:currency"] = currency;
  if (sku) other["product:retailer_item_id"] = sku;

  return {
    ...baseMetadata,
    title: `${name} • ${site.shortName}`,
    description,
    alternates: absUrl ? { canonical: absUrl } : undefined,
    openGraph: {
      ...(baseMetadata.openGraph ?? {}),
      type: "website",
      title: name,
      description,
      url: absUrl,
      images: [{ url: img, width: 1200, height: 630, alt: name }],
    },
    twitter: {
      ...(baseMetadata.twitter ?? {}),
      title: name,
      description,
      images: [img],
    },
    other,
  };
}

export function getCategoryMetadata({
  title,
  description,
  image,
  slug,
}: {
  title: string;
  description?: string;
  image?: string;
  slug?: string;
}): Metadata {
  const absUrl = slug ? absoluteUrl(`/categories/${slug}`) : site.url;
  const img = absoluteImageUrl(image);

  return {
    ...baseMetadata,
    title: `${title} • ${site.shortName}`,
    description,
    alternates: absUrl ? { canonical: absUrl } : undefined,
    openGraph: {
      ...(baseMetadata.openGraph ?? {}),
      type: "website",
      title,
      description,
      url: absUrl,
      images: [{ url: img, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      ...(baseMetadata.twitter ?? {}),
      title,
      description,
      images: [img],
    },
  };
}

export function orgJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    logo: absoluteUrl("/logo.png"),
    sameAs: Object.values(site.socials).filter(Boolean),
  };
}

export function productJsonLd({
  name,
  description,
  image,
  price,
  currency = "USD",
  sku,
  url,
}: {
  name: string;
  description: string;
  image?: string;
  price?: number;
  currency?: string;
  sku?: string;
  url?: string; // (optional) pass the product URL if you have it
}) {
  const img = absoluteImageUrl(image);
  const productUrl = url ? absoluteUrl(url) : site.url;

  return {
    "@context": "https://schema.org/",
    "@type": "Product",
    name,
    description,
    image: [img],
    sku,
    offers:
      price != null
        ? {
            "@type": "Offer",
            priceCurrency: currency,
            price,
            availability: "https://schema.org/InStock",
            url: productUrl,
          }
        : undefined,
  };
}
