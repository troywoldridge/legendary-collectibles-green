import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Strict parser, keep attributes & namespaces so we can inspect reliably */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true, // drop "soap:" / "ns:" prefixes for simpler keys
});

/** Try to persist; if schema/table isn’t wired yet, we just log */
async function persistEvent(eventType: string, payload: unknown) {
  try {
    // Lazy import so the route doesn’t crash if schema isn’t exported yet
    const { db } = await import("@/lib/db");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ebayEvents } = await import("@/lib/db/schema/ebayEvents");
   
    await db.insert(ebayEvents).values({
      source: "platform",
      eventType,
      payload,
    });
  } catch (err: any) {
    console.warn("[eBay Platform] DB persist skipped:", err?.message || err);
  }
}

/** Find the first child element inside SOAP Envelope/Body to name the event */
function detectEventName(xmlObj: any): { eventType: string; payload: any } {
  if (!xmlObj) return { eventType: "Unknown", payload: null };

  // Typical SOAP: { Envelope: { Body: { <NotificationName>: {...} } } }
  const env = xmlObj.Envelope || xmlObj.envelope || xmlObj.SOAPEnvelope;
  const body = env?.Body || env?.body || xmlObj.Body || xmlObj.body;

  if (body && typeof body === "object") {
    const keys = Object.keys(body).filter((k) => k !== "Header" && k !== "header");
    if (keys.length > 0) {
      const k = keys[0];
      return { eventType: String(k), payload: body[k] };
    }
  }

  // Fallback: pick first top-level key
  const topKeys = Object.keys(xmlObj);
  if (topKeys.length > 0) {
    const k = topKeys[0];
    return { eventType: String(k), payload: xmlObj[k] };
  }
  return { eventType: "Unknown", payload: xmlObj };
}

export async function POST(req: NextRequest) {
  // eBay sends text/xml SOAP
  const soapText = await req.text();
  const soapAction = (req.headers.get("soapaction") || "").replace(/(^"|"$)/g, "");

  let xml: any;
  try {
    xml = parser.parse(soapText);
  } catch (err: any) {
    console.error("[eBay Platform] XML parse error:", err?.message || err);
    // eBay will retry if non-200; still return 200 to avoid loops but log as failure.
    return NextResponse.json({ ok: false, error: "parse_error" }, { status: 200 });
  }

  const { eventType, payload } = detectEventName(xml);

  // Light logging (truncate to keep logs sane)
  const snippet = (() => {
    try {
      const s = JSON.stringify(payload);
      return s.length > 2000 ? s.slice(0, 2000) + "…(truncated)" : s;
    } catch {
      return "[unserializable payload]";
    }
  })();

  console.log("[eBay Platform] SOAPAction:", soapAction || "(none)");
  console.log("[eBay Platform] Event:", eventType);
  console.log("[eBay Platform] Payload snippet:", snippet);

  // Persist for auditing/processing (no-op if schema isn’t present yet)
  await persistEvent(eventType || soapAction || "Unknown", {
    soapAction,
    eventType,
    payload,
  });

  // ⚠️ IMPORTANT:
  // Do your business logic here if you want to immediately update orders/listings.
  // Keep it fast (<2s). If heavy, enqueue a job keyed by eventType / IDs in `payload`.

  // eBay only requires a quick 200 OK
  return NextResponse.json({ ok: true });
}

export async function GET() {
  // Health check / allows you to test the route in a browser
  return NextResponse.json({ ok: true, type: "ebay-platform" });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
