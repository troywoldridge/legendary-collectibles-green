import "server-only";

import type { ReactNode } from "react";
import AdminNav from "./_components/AdminNav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <AdminNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
