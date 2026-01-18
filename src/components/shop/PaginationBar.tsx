// src/components/shop/PaginationBar.tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";

type Props = {
  canonicalPath: string; // e.g. /shop/pokemon/single
  page: number;
  totalPages: number;
  baseQuery: string; // query string WITHOUT page, e.g. "q=eevee&sort=price_asc"
  backHref?: string; // optional explicit back link
};

function withPage(canonicalPath: string, baseQuery: string, page: number) {
  const qs = new URLSearchParams(baseQuery || "");
  if (page <= 1) qs.delete("page");
  else qs.set("page", String(page));
  const s = qs.toString();
  return s ? `${canonicalPath}?${s}` : canonicalPath;
}

export default function PaginationBar({
  canonicalPath,
  page,
  totalPages,
  baseQuery,
  backHref,
}: Props) {
  const prevHref = useMemo(() => withPage(canonicalPath, baseQuery, page - 1), [
    canonicalPath,
    baseQuery,
    page,
  ]);

  const nextHref = useMemo(() => withPage(canonicalPath, baseQuery, page + 1), [
    canonicalPath,
    baseQuery,
    page,
  ]);

  const safeBack = backHref || canonicalPath;

  return (
    <div className="pagerRow">
      <div className="pagerInfo">
        Page {page} / {totalPages}
      </div>

      <div className="pagerBtns">
        <Link className="pagerBtn pagerBtnGhost" href={safeBack} prefetch={false}>
          ← Back
        </Link>

        {page > 1 ? (
          <Link className="pagerBtn" href={prevHref} prefetch={false}>
            ← Prev
          </Link>
        ) : (
          <span className="pagerBtn pagerBtnDisabled">← Prev</span>
        )}

        {page < totalPages ? (
          <Link className="pagerBtn" href={nextHref} prefetch={false}>
            Next →
          </Link>
        ) : (
          <span className="pagerBtn pagerBtnDisabled">Next →</span>
        )}
      </div>
    </div>
  );
}

