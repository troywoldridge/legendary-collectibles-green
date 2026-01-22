import "server-only";

import type { ReactNode } from "react";
import { cookies } from "next/headers";
import AdminNav from "./_components/AdminNav";
import AdminGate from "./_components/AdminGate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "admin_ui_token";

function isAllowed(cookieValue: string | undefined | null) {
  const required = (process.env.ADMIN_UI_TOKEN || "").trim();

  // If no token configured, allow (you can remove this if you ALWAYS want a token)
  if (!required) return true;

  return (cookieValue || "").trim() === required;
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const jar = await cookies();
  const cookieVal = jar.get(COOKIE_NAME)?.value ?? null;

  // read ?err=1 from URL is not directly available in layout,
  // so we just always show gate without the message here.
  // We'll show error message using /admin/page.tsx if you want,
  // OR we can show it with a tiny middleware/route wrapper.
  const ok = isAllowed(cookieVal);

  if (!ok) {
    // We can’t read searchParams in layout, so no err hint here.
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <AdminGate err={null} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <AdminNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
