"use client";

import * as React from "react";

type Props = {
  title: string;

  // left-side jump buttons (anchors)
  jumps: Array<{ href: string; label: string }>;

  // right-side actions (server renders these nodes)
  actions: React.ReactNode;

  // optional subline for expanded mode
  subtitle?: string | null;

  // tweak threshold if you want
  collapseAtPx?: number;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function StickyQuickActionsClient({
  title,
  subtitle,
  jumps,
  actions,
  collapseAtPx = 140,
}: Props) {
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    let raf = 0;

    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        setCollapsed(y >= collapseAtPx);
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [collapseAtPx]);

  return (
    <div className="sticky top-0 z-40 -mx-4 px-4 pt-2">
      {/* Backdrop shell */}
      <div
        className={cn(
          "rounded-2xl border border-white/15 backdrop-blur-md",
          "bg-black/40 shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
          "transition-all duration-200",
          collapsed ? "py-2 px-3" : "p-3"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: identity + jumps */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {/* tiny “status dot” vibe */}
              <span className="inline-flex h-2 w-2 rounded-full bg-white/50" />
              <div className="min-w-0">
                <div
                  className={cn(
                    "truncate font-semibold text-white",
                    collapsed ? "text-sm" : "text-sm"
                  )}
                  title={title}
                >
                  {title}
                </div>

                {/* Subtitle only when expanded */}
                {!collapsed && subtitle ? (
                  <div className="mt-0.5 truncate text-xs text-white/60" title={subtitle}>
                    {subtitle}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Jumps */}
            <div
              className={cn(
                "mt-2 flex flex-wrap gap-2",
                "transition-all duration-200",
                collapsed ? "opacity-90" : "opacity-100"
              )}
            >
              {jumps.map((j) => (
                <a
                  key={`${j.href}-${j.label}`}
                  href={j.href}
                  className={cn(
                    "rounded-full border border-white/15 bg-white/5",
                    "text-white/90 hover:bg-white/10",
                    "transition-colors",
                    collapsed ? "px-2.5 py-1 text-[11px]" : "px-3 py-1 text-xs"
                  )}
                >
                  {j.label}
                </a>
              ))}
            </div>
          </div>

          {/* Right: actions */}
          <div
            className={cn(
              "flex flex-wrap items-center gap-2",
              collapsed ? "opacity-95" : "opacity-100"
            )}
          >
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}