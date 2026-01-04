import "server-only";

import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { site } from "@/config/site";
import {
  getDepartmentConfig,
  normalizeDepartmentSlug,
} from "@/lib/shop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { department: string };
}): Promise<Metadata> {
  const d = normalizeDepartmentSlug(params.department);
  const dept = d ? getDepartmentConfig(d) : null;
  const canonical = `${site.url}/shop/${encodeURIComponent(params.department)}`;

  if (!dept) {
    return {
      title: `Shop | ${site.name}`,
      robots: { index: false, follow: true },
      alternates: { canonical },
    };
  }

  return {
    title: `${dept.name} Shop | ${site.name}`,
    description: dept.description,
    alternates: { canonical },
  };
}

export default function DepartmentPage({ params }: { params: { department: string } }) {
  const d = normalizeDepartmentSlug(params.department);
  const dept = d ? getDepartmentConfig(d) : null;
  if (!dept) return notFound();

  return (
    <main className="shopShell">
      <header className="shopHeader">
        <div className="eyebrow">{dept.hero.eyebrow}</div>
        <h1 className="shopTitle">{dept.hero.title}</h1>
        <p className="shopSubtitle">{dept.hero.blurb}</p>
        {dept.hero.accent ? <p className="shopAccent">{dept.hero.accent}</p> : null}

        <div className="chipRow">
          <Link className="chip" href="/shop">
            ← Back to Shop
          </Link>
        </div>
      </header>

      <section className="shopSection">
        <div className="tileGrid">
          {dept.categories.map((c) => (
            <Link key={c.slug} href={`/shop/${d}/${c.slug}`} className="tile tileLarge">
              <div className="tileTitle">{c.name}</div>
              <div className="tileDesc">{c.description}</div>
              <div className="tileCta">Browse →</div>
              {c.badge ? <div className="tileBadge">{c.badge}</div> : null}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
