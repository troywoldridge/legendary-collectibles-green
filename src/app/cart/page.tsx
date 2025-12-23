// src/app/cart/page.tsx
import "server-only";
import CartClient from "@/app/cart/CartClient";

export const dynamic = "force-dynamic";

export default function CartPage() {
  return <CartClient />;
}
