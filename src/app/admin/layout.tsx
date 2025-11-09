import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import React from "react";
import { setAdminToken } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "admin_ui_token";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // In Server Components on Next 16, cookies() is async
  const c = await cookies();
  const required = process.env.ADMIN_UI_TOKEN || "";
  const token = c.get(COOKIE_NAME)?.value;

  // If an admin token is configured, require it
  if (required && token !== required) {
    return (
      <html lang="en">
        <body className="min-h-screen bg-black text-white">
          <div className="mx-auto max-w-md pt-16">
            <h1 className="mb-4 text-2xl font-bold">Admin Access</h1>
            <form action={setAdminToken} className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
              <label className="block text-sm text-white/80">
                Enter admin token
                <input
                  type="password"
                  name="token"
                  className="mt-1 w-full rounded bg-black/30 px-3 py-2 text-white ring-1 ring-white/10 outline-none"
                  placeholder="••••••••"
                  required
                />
              </label>
              <button
                type="submit"
                className="rounded bg-sky-600 px-3 py-2 text-sm hover:bg-sky-500"
              >
                Continue
              </button>
              {!required && (
                <p className="text-xs text-white/60">
                  No <code>ADMIN_UI_TOKEN</code> set; form accepts any value in dev.
                </p>
              )}
            </form>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <header className="border-b border-white/10 bg-white/5">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 text-sm">
            <nav className="flex items-center gap-4">
              <Link href="/admin" className="text-white/80 hover:text-white">Admin</Link>
              <Link href="/admin/email-events" className="text-white/80 hover:text-white">Email Events</Link>
            </nav>
            <div className="text-white/60">Legendary Collectibles</div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl p-4">{children}</main>
      </body>
    </html>
  );
}
