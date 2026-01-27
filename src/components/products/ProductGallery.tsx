/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

export type GalleryImage = {
  url: string;
  alt?: string | null;
  sort?: number | null;
};

function s(v: unknown): string {
  return String(v ?? "").trim();
}

function normImg(v: GalleryImage): GalleryImage | null {
  const url = s(v?.url);
  if (!url) return null;
  return { url, alt: v.alt ?? null, sort: v.sort ?? null };
}

export default function ProductGallery({
  title,
  images,
}: {
  title: string;
  images: GalleryImage[];
}) {
  const list = useMemo(() => {
    const out: GalleryImage[] = [];
    for (const im of images || []) {
      const n = normImg(im);
      if (!n) continue;
      if (out.findIndex((x) => x.url === n.url) === -1) out.push(n);
    }
    // sort order first (nulls last)
    out.sort((a, b) => {
      const as = a.sort ?? 9999;
      const bs = b.sort ?? 9999;
      return as - bs;
    });
    return out;
  }, [images]);

  const [active, setActive] = useState(0);

  const main = list[active] ?? list[0] ?? null;

  return (
    <div className="w-full">
      {/* MAIN IMAGE (this must be a real box for Image fill) */}
      <div className="relative w-full aspect-square overflow-hidden rounded-2xl border border-white/15 bg-black/30">
        {main ? (
          <Image
            src={main.url}
            alt={main.alt ?? title}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-white/50">
            No image
          </div>
        )}
      </div>

      {/* THUMBNAILS */}
      {list.length > 1 ? (
        <div className="mt-3 grid grid-cols-6 gap-2">
          {list.slice(0, 6).map((im, idx) => {
            const isActive = idx === active;
            return (
              <button
                key={im.url}
                type="button"
                onClick={() => setActive(idx)}
                className={[
                  "relative aspect-square overflow-hidden rounded-lg border bg-black/30",
                  isActive ? "border-white/40" : "border-white/15 hover:border-white/30",
                ].join(" ")}
                aria-label={`View image ${idx + 1}`}
              >
                <Image
                  src={im.url}
                  alt={im.alt ?? title}
                  fill
                  sizes="120px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
