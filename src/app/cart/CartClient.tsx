// src/app/cart/CheckoutButton.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

type Props = {
  disabled?: boolean;
};

/**
 * Behavior:
 * - Guest users can view cart
 * - Clicking proceeds -> requires sign-in (redirects back to /cart/review)
 * - Signed-in users go straight to /cart/review
 */
export default function CheckoutButton({ disabled }: Props) {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const [busy, setBusy] = useState(false);

  const label = useMemo(() => {
    if (disabled) return "Checkout";
    if (!isSignedIn) return "Proceed to checkout";
    return "Proceed to checkout";
  }, [disabled, isSignedIn]);

  async function onClick() {
    if (disabled || busy) return;

    setBusy(true);
    try {
      // Where checkout begins in your app:
      const checkoutPath = "/cart/review";

      // If not signed in, force sign-in *now* and come back to checkout.
      if (!isSignedIn) {
        const redirectUrl = encodeURIComponent(checkoutPath);
        router.push(`/sign-in?redirect_url=${redirectUrl}`);
        return;
      }

      // Signed-in: go to checkout flow.
      router.push(checkoutPath);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? "Loading…" : label}
    </button>
  );
}
