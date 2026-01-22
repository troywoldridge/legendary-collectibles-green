"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: Array<{ href: string; label: string }> = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/email-events", label: "Email Events" },
  { href: "/admin/ai/listings", label: "AI Listings" },
];


function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminNav() {
  const pathname = usePathname() || "";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold tracking-wide text-white/90">Admin</div>
          <div className="text-xs opacity-70">Internal tools</div>
        </div>

        <nav className="flex flex-wrap gap-2">
          {LINKS.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={[
                  "rounded-lg border px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-indigo-400/40 bg-indigo-500/15 text-white"
                    : "border-white/10 bg-black/20 text-white/80 hover:bg-white/10 hover:text-white",
                ].join(" ")}
                aria-current={active ? "page" : undefined}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
