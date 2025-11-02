// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";

  // Never redirect local
  if (host.includes("127.0.0.1") || host.startsWith("localhost") || host.includes(":3001")) {
    return NextResponse.next();
  }

  // Only enforce canonical in production if you want to
  const canonical = process.env.CANONICAL_HOST; // set to "legendary-collectibles.com"
  if (canonical && host !== canonical) {
    const url = new URL(req.nextUrl);
    url.host = canonical;
    url.protocol = "https:";
    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}
