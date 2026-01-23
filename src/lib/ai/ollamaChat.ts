// src/lib/ai/ollamaChat.ts
import "server-only";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

function mustEnv(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export async function ollamaChat(opts: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number; // maps to num_predict
  json?: boolean; // if true, ask Ollama for JSON formatting
}): Promise<{ content: string; model: string }> {
  const baseUrl = mustEnv("OLLAMA_URL", "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = mustEnv("OLLAMA_MODEL", "llama3.1:8b");

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      stream: false,
      format: opts.json ? "json" : undefined,
      options: {
        temperature: typeof opts.temperature === "number" ? opts.temperature : 0.2,
        num_predict: typeof opts.maxTokens === "number" ? opts.maxTokens : undefined,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama error ${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json().catch(() => ({}))) as any;
  const content = String(data?.message?.content ?? "").trim();
  const usedModel = String(data?.model ?? model).trim() || model;

  if (!content) throw new Error("Ollama returned empty content.");
  return { content, model: usedModel };
}
