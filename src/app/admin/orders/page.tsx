import "server-only";
import type { Metadata } from "next";
import OrdersClient from "./OrdersClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin • Orders • Legendary Collectibles",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="max-w-7xl">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <p className="mt-2 opacity-80">Recent orders. Click an order to open details.</p>
      <div className="mt-6">
        <OrdersClient />
      </div>
    </div>
  );
}
