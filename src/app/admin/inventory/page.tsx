import Link from "next/link";
import AdminTokenGate from "@/components/admin/AdminTokenGate";

export default function InventoryAdminHome() {
  return (
    <AdminTokenGate>
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>Inventory Admin</h1>
      <ul style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <li><Link href="/admin/inventory/intake">📥 Intake (Upload CSV)</Link></li>
        <li><Link href="/admin/inventory/drafts">📝 Drafts (Polish → Publish)</Link></li>
        <li><Link href="/admin/inventory/items">📦 Items (All inventory)</Link></li>
      </ul>
    </AdminTokenGate>
  );
}
