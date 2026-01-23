// src/lib/ai/ollamaChat.ts
import "server-only";

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

function mustEnv(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function toInt(v: unknown, fallback: number) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function ollamaChat(opts: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number; // maps to num_predict
  json?: boolean; // if true, ask Ollama for JSON formatting
}): Promise<{ content: string; model: string }> {
  const baseUrl = mustEnv("OLLAMA_URL", "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = mustEnv("OLLAMA_MODEL", "llama3.1:8b");

  // Default timeout: 10s (override with OLLAMA_TIMEOUT_MS)
  const timeoutMs = toInt(process.env.OLLAMA_TIMEOUT_MS, 10_000);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), Math.max(1_000, timeoutMs));

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ac.signal,
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
  } catch (e: any) {
    // Normalize abort error message so auto-fallback behaves nicely
    if (e?.name === "AbortError") {
      throw new Error(`Ollama timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}
