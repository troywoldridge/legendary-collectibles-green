import Link from "next/link";

export default function InventoryAdminHome() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Inventory</h1>
      <p className="mt-2 opacity-80">Pick a tool:</p>

      <div className="mt-6 grid gap-3">
        <Link
          href="/admin/inventory/drafts"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10"
        >
          <div className="font-medium">Drafts</div>
          <div className="text-sm opacity-70">Review and publish drafts.</div>
        </Link>

        <Link
          href="/admin/inventory/intake"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10"
        >
          <div className="font-medium">Intake</div>
          <div className="text-sm opacity-70">Upload / import inventory batches.</div>
        </Link>

        <Link
          href="/admin/inventory/items"
          className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:bg-white/10"
        >
          <div className="font-medium">Items</div>
          <div className="text-sm opacity-70">Browse and edit inventory items.</div>
        </Link>
      </div>
    </div>
  );
}
