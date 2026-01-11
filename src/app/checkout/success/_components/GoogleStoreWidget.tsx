"use client";

import Script from "next/script";

type Props = {
  position?: "RIGHT_BOTTOM" | "LEFT_BOTTOM";
  sideMargin?: number;
  bottomMargin?: number;
  mobileSideMargin?: number;
  mobileBottomMargin?: number;
};

export default function GoogleStoreWidget({
  position = "RIGHT_BOTTOM",
  sideMargin,
  bottomMargin,
  mobileSideMargin,
  mobileBottomMargin,
}: Props) {
  // Mirrors Google’s recommended snippet (load script, then merchantwidget.start)
  // Position defaults to RIGHT_BOTTOM; LEFT_BOTTOM is also supported. :contentReference[oaicite:1]{index=1}
  const startInline = `
    (function () {
      function startWidget() {
        if (!window.merchantwidget || !window.merchantwidget.start) return;
        window.merchantwidget.start({
          position: ${JSON.stringify(position)},
          ${typeof sideMargin === "number" ? `sideMargin: ${sideMargin},` : ""}
          ${typeof bottomMargin === "number" ? `bottomMargin: ${bottomMargin},` : ""}
          ${typeof mobileSideMargin === "number" ? `mobileSideMargin: ${mobileSideMargin},` : ""}
          ${typeof mobileBottomMargin === "number" ? `mobileBottomMargin: ${mobileBottomMargin},` : ""}
        });
      }

      // If script already loaded, start immediately; else wait for load.
      if (document.readyState === "complete") startWidget();
      window.addEventListener("load", startWidget);
    })();
  `;

  return (
    <>
      {/* Load the merchant widget script (new Store Widget) */}
      <Script
        id="merchantWidgetScript"
        src="https://www.gstatic.com/shopping/merchant/merchantwidget.js"
        strategy="afterInteractive"
      />

      {/* Start the widget after load */}
      <Script
        id="merchantWidgetStart"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: startInline }}
      />
    </>
  );
}

// Global type so TS doesn't complain
declare global {
  interface Window {
    merchantwidget?: { start: (opts: any) => void };
  }
}
