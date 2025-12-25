import AdminTokenGate from "@/components/admin/AdminTokenGate";
import ItemEditor from "./ui";

export default async function InventoryItemEditPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;

  return (
    <AdminTokenGate>
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 800 }}>Edit Inventory Item</div>
        <div style={{ opacity: 0.8, marginTop: 6 }}>{id}</div>

        <div style={{ marginTop: 18 }}>
          <ItemEditor id={id} />
        </div>
      </div>
    </AdminTokenGate>
  );
}
