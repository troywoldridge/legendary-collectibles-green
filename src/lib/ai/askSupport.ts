import fs from "node:fs";
import path from "node:path";

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

const CONTENT_DIR = path.join(process.cwd(), "src/content/ai");

function loadKnowledge() {
  if (!fs.existsSync(CONTENT_DIR)) {
    return { ok: false as const, error: `Missing folder: ${CONTENT_DIR}` };
  }
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    return { ok: false as const, error: `No .md files found in: ${CONTENT_DIR}` };
  }
  const text = files
    .map((file) => `SOURCE: ${file}\n${fs.readFileSync(path.join(CONTENT_DIR, file), "utf8")}`)
    .join("\n\n---\n\n");
  return { ok: true as const, files, text };
}

function pickAnswerFromOpenAIResponse(data: unknown): string | null {
  // { choices: [ { message: { content: "..." } } ] }
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

export async function askSupport(question: string) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false as const,
      status: 500,
      body: { error: "server_config", message: "OPENAI_API_KEY missing on server." },
    };
  }

  const knowledge = loadKnowledge();
  if (!knowledge.ok) {
    return { ok: false as const, status: 500, body: { error: "knowledge_error", message: knowledge.error } };
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
            "- Keep answers concise, friendly, and factual.",
        },
        { role: "user", content: `Knowledge:\n${knowledge.text}\n\nQuestion:\n${question}` },
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
    return {
      ok: false as const,
      status: 502,
      body: {
        error: "openai_error",
        status: r.status,
        statusText: r.statusText,
        details: isObject(parsed) ? parsed : raw.slice(0, 800),
      },
    };
  }

  const answer = pickAnswerFromOpenAIResponse(parsed);
  if (!answer) {
    return {
      ok: false as const,
      status: 502,
      body: { error: "openai_empty", message: "OpenAI returned no message content." },
    };
  }

  return { ok: true as const, status: 200, body: { answer, sources: knowledge.files } };
}
