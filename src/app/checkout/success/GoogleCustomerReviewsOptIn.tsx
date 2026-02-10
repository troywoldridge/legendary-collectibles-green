"use client";

import Script from "next/script";
import { useMemo } from "react";

type OptInStyle =
  | "TOP_RIGHT_DIALOG"
  | "BOTTOM_RIGHT_DIALOG"
  | "BOTTOM_LEFT_DIALOG"
  | "CENTER_DIALOG";

type Props = {
  merchantId: number;
  orderId: string;
  email: string;
  deliveryCountry: string; // ISO-2, e.g. "US"
  estimatedDeliveryDate: string; // "YYYY-MM-DD"
  products?: { gtin: string }[];
  optInStyle?: OptInStyle;
};

export default function GoogleCustomerReviewsOptIn({
  merchantId,
  orderId,
  email,
  deliveryCountry,
  estimatedDeliveryDate,
  products,
  optInStyle = "CENTER_DIALOG",
}: Props) {
  const payload = useMemo(() => {
    const base: any = {
      merchant_id: merchantId,
      order_id: orderId,
      email,
      delivery_country: deliveryCountry,
      estimated_delivery_date: estimatedDeliveryDate,
      opt_in_style: optInStyle,
    };

    if (products?.length) base.products = products;
    return base;
  }, [merchantId, orderId, email, deliveryCountry, estimatedDeliveryDate, products, optInStyle]);

  return (
    <>
      <Script
        src="https://apis.google.com/js/platform.js?onload=renderOptIn"
        strategy="afterInteractive"
      />
      <Script id="gcr-optin" strategy="afterInteractive">
        {`
          window.renderOptIn = function () {
            if (!window.gapi) return;
            window.gapi.load('surveyoptin', function () {
              window.gapi.surveyoptin.render(${JSON.stringify(payload)});
            });
          };
        `}
      </Script>
    </>
  );
}
