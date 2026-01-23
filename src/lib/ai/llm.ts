// src/lib/ai/llm.ts
import "server-only";

import OpenAI from "openai";
import { ollamaChat, type ChatMessage } from "@/lib/ai/ollamaChat";

type Provider = "auto" | "ollama" | "openai";

function provider(): Provider {
  const p = String(process.env.AI_PROVIDER || "auto").toLowerCase();
  if (p === "ollama" || p === "openai" || p === "auto") return p;
  return "auto";
}

const openai =
  process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

async function openaiText(opts: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}): Promise<{ content: string; model: string }> {
  if (!openai) throw new Error("OPENAI_API_KEY not configured");

  const model = (process.env.OPENAI_MODEL || "gpt-5-mini").trim();

  // If you want to encourage strict JSON, we add a light constraint to system.
  // (We still parse/validate on our side, so this is just guidance.)
  const messages = opts.json
    ? opts.messages.map((m) =>
        m.role === "system"
          ? { ...m, content: `${m.content}\n\nReturn ONLY valid JSON.` }
          : m,
      )
    : opts.messages;

  const resp = await openai.responses.create({
    model,
    input: messages.map((m) => ({ role: m.role, content: m.content })),
    temperature: typeof opts.temperature === "number" ? opts.temperature : 0.2,
  });

  const text =
    (resp as any)?.output_text ||
    String((resp as any)?.output?.[0]?.content?.[0]?.text ?? "").trim();

  const content = String(text ?? "").trim();
  if (!content) throw new Error("OpenAI returned empty content");

  return { content, model: (resp as any)?.model ?? model };
}

export async function llmText(opts: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}): Promise<{ content: string; provider: "ollama" | "openai"; model: string }> {
  const p = provider();

  if (p === "ollama") {
    const o = await ollamaChat(opts);
    return { content: o.content, provider: "ollama", model: o.model };
  }

  if (p === "openai") {
    const o = await openaiText(opts);
    return { content: o.content, provider: "openai", model: o.model };
  }

  // auto: try ollama first, fall back to openai
  try {
    const o = await ollamaChat(opts);
    return { content: o.content, provider: "ollama", model: o.model };
  } catch {
    const o = await openaiText(opts);
    return { content: o.content, provider: "openai", model: o.model };
  }
}
