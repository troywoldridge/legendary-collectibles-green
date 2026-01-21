import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_DIR = path.join(process.cwd(), "src/content/ai");

function loadKnowledge(): string {
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith(".md"));
  return files
    .map(file => {
      const content = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
      return `SOURCE: ${file}\n${content}`;
    })
    .join("\n\n---\n\n");
}

export async function POST(req: Request) {
  const { question } = await req.json();

  if (!question) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  const knowledge = loadKnowledge();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `
You are a customer support assistant for Legendary Collectibles.

Rules:
- Answer ONLY using the provided knowledge.
- If the answer is not present, say you don’t know and suggest contacting support@legendary-collectibles.com.
- Do NOT invent policies or guarantees.
- Keep answers concise, friendly, and factual.
`,
        },
        {
          role: "user",
          content: `Knowledge:\n${knowledge}\n\nQuestion:\n${question}`,
        },
      ],
      temperature: 0.2,
    }),
  });

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content ?? "Sorry, I don’t have that information.";

  return NextResponse.json({ answer });
}
