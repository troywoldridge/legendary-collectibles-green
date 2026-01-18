// src/app/shop/[department]/page.tsx
import "server-only";

import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { site } from "@/config/site";
import { getDepartmentConfig, normalizeDepartmentSlug } from "@/lib/shop/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { department: string };

function norm(s: unknown) {
  return String(s ?? "").trim();
}

export async function generateMetadata(props: {
  params: Params | Promise<Params>;
}): Promise<Metadata> {
  const params = await props.params;
  const department = norm(params?.department);

  const deptKey = normalizeDepartmentSlug(department);
  const dept = deptKey ? getDepartmentConfig(deptKey) : null;

  const canonical = deptKey
    ? `${site.url}/shop/${encodeURIComponent(deptKey)}`
    : `${site.url}/shop/${encodeURIComponent(department)}`;

  if (!dept) {
    return {
      title: `Shop | ${site.name}`,
      robots: { index: true, follow: true },
      alternates: { canonical },
    };
  }

  return {
    title: `${dept.name} Shop | ${site.name}`,
    description: dept.description,
    alternates: { canonical },
  };
}

export default async function DepartmentPage(props: {
  params: Params | Promise<Params>;
}) {
  const params = await props.params;
  const department = norm(params?.department);

  const deptKey = normalizeDepartmentSlug(department);
  const dept = deptKey ? getDepartmentConfig(deptKey) : null;
  if (!deptKey || !dept) notFound();

  // Canonicalize /shop/yugi -> /shop/yugioh (and casing)
  const raw = department.toLowerCase();
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
