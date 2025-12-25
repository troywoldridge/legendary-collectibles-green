import AdminTokenGate from "@/components/admin/AdminTokenGate";
import DraftsList from "./list";

export default function DraftsPage() {
  return (
    <AdminTokenGate>
      <DraftsList />
    </AdminTokenGate>
  );
}
