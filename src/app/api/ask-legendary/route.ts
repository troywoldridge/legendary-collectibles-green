import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_DIR = path.join(process.cwd(), "src/content/ai");
const MAX_KNOWLEDGE_CHARS = 120_000; // keep requests reasonable

type JsonObject = Record<string, unknown>;
function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function safeEq(a: string, b: string): boolean {
  // cheap constant-time-ish compare to avoid trivial timing leaks
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function loadKnowledge() {
  if (!fs.existsSync(CONTENT_DIR)) {
    return { ok: false as const, error: `Missing folder: ${CONTENT_DIR}` };
  }
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) {
    return { ok: false as const, error: `No .md files found in: ${CONTENT_DIR}` };
  }

  // Build a single text blob with file markers
  let text = files
    .map((file) => `SOURCE: ${file}\n${fs.readFileSync(path.join(CONTENT_DIR, file), "utf8")}`)
    .join("\n\n---\n\n");

  // Cap the payload (prevents huge prompt costs)
  if (text.length > MAX_KNOWLEDGE_CHARS) {
    text = text.slice(0, MAX_KNOWLEDGE_CHARS) + "\n\n[TRUNCATED]\n";
  }

  return { ok: true as const, files, text };
}

function pickQuestion(body: unknown): string {
  if (!isObject(body)) return "";
  const q = body["question"];
  return typeof q === "string" ? q.trim() : "";
}

function pickAnswerFromOpenAIResponse(data: unknown): string | null {
  if (!isObject(data)) return null;
  const choices = data["choices"];
  if (!Array.isArray(choices) || choices.length === 0) return null;

  const first = choices[0];
  if (!isObject(first)) return null;

  const message = first["message"];
  if (!isObject(message)) return null;

  const content = message["content"];
  if (typeof content !== "string") return null;

  const trimmed = content.trim();
  return trimmed ? trimmed : null;
}

export async function POST(req: Request) {
  try {
    // Token guard (required)
    const token = req.headers.get("x-ai-token") || "";
    const expected = process.env.AI_WIDGET_TOKEN || "";
    if (!expected || !safeEq(token, expected)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body: unknown = await req.json().catch(() => ({}));
    const question = pickQuestion(body);

    if (!question) {
      return NextResponse.json(
        { error: "bad_request", message: "Missing question" },
        { status: 400 },
      );
    }

    if (question.length > 300) {
      return NextResponse.json(
        { error: "bad_request", message: "Question too long (max 300 characters)." },
        { status: 400 },
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "server_config", message: "OPENAI_API_KEY missing on server." },
        { status: 500 },
      );
    }

    const knowledge = loadKnowledge();
    if (!knowledge.ok) {
      return NextResponse.json(
        { error: "knowledge_error", message: knowledge.error },
        { status: 500 },
      );
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a customer support assistant for Legendary Collectibles.\n" +
              "Rules:\n" +
              "- Answer ONLY using the provided knowledge.\n" +
              "- If the answer is not present, say you don’t know and suggest contacting support@legendary-collectibles.com.\n" +
              "- Do NOT invent policies or guarantees.\n" +
              "- Keep answers concise, friendly, and factual.\n" +
              "- If you cite details, prefer quoting exact policy language briefly.",
          },
          {
            role: "user",
            content: `Knowledge:\n${knowledge.text}\n\nQuestion:\n${question}`,
          },
        ],
      }),
    });

    const raw = await r.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = null;
    }

    if (!r.ok) {
      return NextResponse.json(
        {
          error: "openai_error",
          status: r.status,
          statusText: r.statusText,
          details: isObject(parsed) ? parsed : raw.slice(0, 800),
        },
        { status: 502 },
      );
    }

    const answer = pickAnswerFromOpenAIResponse(parsed);
    if (!answer) {
      return NextResponse.json(
        {
          error: "openai_empty",
          message: "OpenAI returned no message content.",
          details: isObject(parsed) ? parsed : raw.slice(0, 800),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ answer, sources: knowledge.files });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "server_error", message: msg }, { status: 500 });
  }
}
