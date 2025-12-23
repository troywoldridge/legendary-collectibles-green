// src/components/shop/ProductGrid.tsx
import Link from "next/link";
import AddToCartButton from "@/components/shop/AddToCartButton";

function dollars(cents: number) {
  const n = Number(cents ?? 0) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function badgeText(p: any) {
  if (p?.isGraded && p?.grader && p?.gradeX10) {
    const grade = (p.gradeX10 / 10).toFixed(p.gradeX10 % 10 === 0 ? 0 : 1);
    return `${String(p.grader).toUpperCase()} ${grade}`;
  }
  if (p?.sealed) return "SEALED";
  if (p?.condition) return String(p.condition).toUpperCase();
  return null;
}

export default function ProductGrid({
  items,
  total,
  page,
  limit,
}: {
  items: any[];
  total: number;
  page: number;
  limit: number;
}) {
  return (
    <div>
      <div className="resultsBar">
        <div className="resultsText">
          Showing {(items?.length ?? 0).toLocaleString()} of {total.toLocaleString()}
        </div>
      </div>

      <div className="productGrid">
        {items.map((p) => {
          const badge = badgeText(p);
          const hasCompare = p.compareAtCents && p.compareAtCents > p.priceCents;

          return (
            <div key={p.id} className="productCard">
              <Link href={`/product/${p.slug}`} className="productMedia">
                {p.image?.url ? (
                  // using plain img here; if you have next/image configured for Cloudflare, swap it in
                  <img className="productImg" src={p.image.url} alt={p.image.alt || p.title} />
                ) : (
                  <div className="productImgFallback">No image</div>
                )}
                {badge ? <div className="productBadge">{badge}</div> : null}
              </Link>

              <div className="productBody">
                <Link href={`/product/${p.slug}`} className="productTitle">
                  {p.title}
                </Link>
                {p.subtitle ? <div className="productSubtitle">{p.subtitle}</div> : null}

                <div className="productPriceRow">
                  <div className="productPrice">{dollars(p.priceCents)}</div>
                  {hasCompare ? (
                    <div className="productCompare">{dollars(p.compareAtCents)}</div>
                  ) : null}
                </div>

                <div className="productMetaRow">
                  <div className="productMeta">
                    {p.inventoryType === "unique" ? "One-of-one" : "In stock"}
                    {typeof p.quantity === "number" ? ` · Qty ${p.quantity}` : ""}
                  </div>
                </div>

                <AddToCartButton
                  product={{
                    id: p.id,
                    slug: p.slug,
                    title: p.title,
                    priceCents: p.priceCents,
                    imageUrl: p.image?.url ?? null,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="pager">
        <Pager page={page} limit={limit} total={total} />
      </div>
    </div>
  );
}

function Pager({ page, limit, total }: { page: number; limit: number; total: number }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;

  // Keep it simple — the listing page already manages querystring; this just adjusts page param in-place
  return (
    <div className="pagerRow">
      {prev ? <a className="pagerBtn" href={`?page=${prev}&limit=${limit}`}>← Prev</a> : <span />}
      <div className="pagerInfo">
        Page {page} / {totalPages}
      </div>
      {next ? <a className="pagerBtn" href={`?page=${next}&limit=${limit}`}>Next →</a> : <span />}
    </div>
  );
}
