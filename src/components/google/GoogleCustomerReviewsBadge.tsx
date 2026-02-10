"use client";

import Script from "next/script";

type Position = "RIGHT_BOTTOM" | "LEFT_BOTTOM";

declare global {
  interface Window {
    merchantwidget?: {
      start: (opts: any) => void;
    };
  }
}

type Props = {
  // Optional in Google's example, but your snippet includes it.
  // We'll pass it if provided (>0).
  merchantId?: number;

  // Optional fields per store widget docs/snippet
  position?: Position; // "RIGHT_BOTTOM" (default) | "LEFT_BOTTOM"
  region?: string; // e.g. "US", "CA"

  // Optional positioning tweaks from Google docs
  sideMargin?: number;
  bottomMargin?: number;
  mobileSideMargin?: number;
  mobileBottomMargin?: number;
};

export default function GoogleCustomerReviewsBadge({
  merchantId,
  position = "RIGHT_BOTTOM",
  region,
  sideMargin,
  bottomMargin,
  mobileSideMargin,
  mobileBottomMargin,
}: Props) {
  return (
    <Script
      id="merchantWidgetScript"
      src="https://www.gstatic.com/shopping/merchant/merchantwidget.js"
      strategy="afterInteractive"
      onLoad={() => {
        try {
          if (!window.merchantwidget?.start) return;

          const opts: any = { position };

          // Some accounts/snippets include merchant_id; include it if valid.
          if (merchantId && merchantId > 0) opts.merchant_id = merchantId;

          if (region) opts.region = region;

          if (typeof sideMargin === "number") opts.sideMargin = sideMargin;
          if (typeof bottomMargin === "number") opts.bottomMargin = bottomMargin;
          if (typeof mobileSideMargin === "number") opts.mobileSideMargin = mobileSideMargin;
          if (typeof mobileBottomMargin === "number") opts.mobileBottomMargin = mobileBottomMargin;

          window.merchantwidget.start(opts);
        } catch {
          // optional widget: never break the page
        }
      }}
    />
  );
}
