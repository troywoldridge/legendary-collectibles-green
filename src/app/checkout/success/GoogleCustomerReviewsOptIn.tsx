"use client";

import Script from "next/script";

declare global {
  interface Window {
    gapi?: any;
    renderOptIn?: () => void;
  }
}

type Props = {
  merchantId: string;
  orderId: string;
  email: string;
  deliveryCountry: string; // ISO 3166-1 alpha-2, e.g. "US"
  estimatedDeliveryDate: string; // YYYY-MM-DD
  optInStyle?:
    | "CENTER_DIALOG"
    | "BOTTOM_RIGHT_DIALOG"
    | "BOTTOM_LEFT_DIALOG"
    | "TOP_RIGHT_DIALOG"
    | "TOP_LEFT_DIALOG"
    | "BOTTOM_TRAY";
};

export default function GoogleCustomerReviewsOptIn({
  merchantId,
  orderId,
  email,
  deliveryCountry,
  estimatedDeliveryDate,
  optInStyle = "CENTER_DIALOG",
}: Props) {
  // Define the callback Google calls when the platform script loads
  const defineRenderOptIn = () => {
    window.renderOptIn = function () {
      try {
        if (!window.gapi?.load) return;

        window.gapi.load("surveyoptin", function () {
          window.gapi.surveyoptin.render({
            // REQUIRED
            merchant_id: merchantId,
            order_id: orderId,
            email,
            delivery_country: deliveryCountry,
            estimated_delivery_date: estimatedDeliveryDate,

            // OPTIONAL
            opt_in_style: optInStyle,
          });
        });
      } catch (e) {
        // Don’t break the thank-you page if Google script errors out
        console.warn("[GCR] opt-in render failed", e);
      }
    };
  };

  return (
    <>
      {/* Define renderOptIn BEFORE the platform script loads */}
      <Script
        id="gcr-define-renderoptin"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.renderOptIn = window.renderOptIn || function() {};`,
        }}
        onReady={defineRenderOptIn}
      />

      {/* Load Google's script (uses onload=renderOptIn per Google docs) */}
      <Script
        id="gcr-platform"
        strategy="afterInteractive"
        src="https://apis.google.com/js/platform.js?onload=renderOptIn"
      />
    </>
  );
}
