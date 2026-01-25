// src/components/funko/FunkoAlertBanners.tsx
import type React from "react";

type Props = {
  isChase?: boolean | null;
  isExclusive?: boolean | null;
  exclusivity?: string | null;
  releaseYear?: number | null;
  extra?: any;
};

function chipBase() {
  return "inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white";
}

export default function FunkoAlertBanners(props: Props) {
  const year = new Date().getFullYear();
  const extra = props.extra ?? {};
  const salePercent = typeof extra?.sale_percent === "number" ? extra.sale_percent : null;
  const isNew =
    extra?.is_new === true ||
    extra?.new_arrival === true ||
    (typeof props.releaseYear === "number" && props.releaseYear >= year);

  const banners: React.ReactNode[] = [];

  if (isNew) {
    banners.push(
      <span key="new" className={chipBase()}>
        ✨ New arrival
      </span>,
    );
  }

  if (salePercent && salePercent > 0) {
    banners.push(
      <span key="sale" className={chipBase()}>
        🔥 Sale {salePercent}%
      </span>,
    );
  }

  if (props.isChase) {
    banners.push(
      <span key="chase" className={chipBase()}>
        🏁 Chase
      </span>,
    );
  }

  if (props.isExclusive || (props.exclusivity && props.exclusivity.trim())) {
    banners.push(
      <span key="exclusive" className={chipBase()}>
        ⭐ Exclusive{props.exclusivity ? `: ${props.exclusivity}` : ""}
      </span>,
    );
  }

  if (!banners.length) return null;

  return <div className="flex flex-wrap gap-2">{banners}</div>;
}
