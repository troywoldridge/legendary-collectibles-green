// src/app/cart/page.tsx
export const dynamic = "force-static";
export default function CartPage() {
  return (
    <section className="mx-auto max-w-3xl p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Cart</h1>
      <p>Your cart is empty (placeholder).</p>
    </section>
  );
}
