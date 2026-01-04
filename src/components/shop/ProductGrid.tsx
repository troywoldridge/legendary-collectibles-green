// src/components/shop/ProductGrid.tsx
import Link from "next/link";
import AddToCartButton from "@/components/shop/AddToCartButton";

function dollars(cents: number) {
  const n = Number(cents ?? 0) / 100;
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function badgeText(p: any) {
  // NOTE: your API returns snake_case (is_graded, grade_x10, image_url, etc.)
  if (p?.is_graded && p?.grader && p?.grade_x10) {
    const grade = (p.grade_x10 / 10).toFixed(p.grade_x10 % 10 === 0 ? 0 : 1);
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
          const hasCompare = p.compare_at_cents && p.compare_at_cents > p.price_cents;

          return (
            <div key={p.id} className="productCard">
              {/* ✅ your existing site uses /products/[slug] not /product/[slug] */}
              <Link href={`/products/${p.slug}`} className="productMedia">
                {p.image_url ? (
                  // keep <img> since your styles already expect it
                  <img className="productImg" src={p.image_url} alt={p.title} />
                ) : (
                  <div className="productImgFallback">No image</div>
                )}
                {badge ? <div className="productBadge">{badge}</div> : null}
              </Link>

              <div className="productBody">
                <Link href={`/products/${p.slug}`} className="productTitle">
                  {p.title}
                </Link>

                {p.subtitle ? <div className="productSubtitle">{p.subtitle}</div> : null}

                <div className="productPriceRow">
                  <div className="productPrice">{dollars(p.price_cents)}</div>
                  {hasCompare ? (
                    <div className="productCompare">{dollars(p.compare_at_cents)}</div>
                  ) : null}
                </div>

                <div className="productMetaRow">
                  <div className="productMeta">
                    {p.inventory_type === "unique" ? "One-of-one" : "In stock"}
                    {typeof p.quantity === "number" ? ` · Qty ${p.quantity}` : ""}
                  </div>
                </div>

                {/* ✅ FIX: AddToCartButton expects productId + availableQty */}
                <AddToCartButton productId={p.id} availableQty={p.quantity} />
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

  return (
    <div className="pagerRow">
      {prev ? (
        <a className="pagerBtn" href={`?page=${prev}&limit=${limit}`}>
          ← Prev
        </a>
      ) : (
        <span />
      )}
      <div className="pagerInfo">
        Page {page} / {totalPages}
      </div>
      {next ? (
        <a className="pagerBtn" href={`?page=${next}&limit=${limit}`}>
          Next →
        </a>
      ) : (
        <span />
      )}
    </div>
  );
}
