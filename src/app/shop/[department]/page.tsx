import "server-only";

import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { site } from "@/config/site";
import { getDepartmentConfig, normalizeDepartmentSlug } from "@/lib/shop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { department: string };
}): Promise<Metadata> {
  const deptKey = normalizeDepartmentSlug(params.department);
  const dept = deptKey ? getDepartmentConfig(deptKey) : null;

  const canonical = deptKey
    ? `${site.url}/shop/${encodeURIComponent(deptKey)}`
    : `${site.url}/shop/${encodeURIComponent(params.department)}`;

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
  const deptKey = normalizeDepartmentSlug(params.department);
  const dept = deptKey ? getDepartmentConfig(deptKey) : null;
  if (!deptKey || !dept) return notFound();

  // Canonicalize /shop/yugi -> /shop/yugioh (and any casing weirdness)
  const raw = String(params.department ?? "").trim().toLowerCase();
  if (raw !== deptKey) {
    redirect(`/shop/${deptKey}`);
  }

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
            <Link key={c.slug} href={`/shop/${deptKey}/${c.slug}`} className="tile tileLarge">
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
