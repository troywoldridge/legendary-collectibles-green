// src/lib/ai/llm.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";

export type LlmRole = "system" | "user" | "assistant";

export type LlmMessage = {
  role: LlmRole;
  content: string;
};

export type LlmTextArgs = {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  messages: LlmMessage[];
};

export type LlmTextResult = {
  content: string;
  provider: "ollama" | "openai";
  model: string;
};

function env(name: string, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function normalizeBaseUrl(u: string) {
  return u.replace(/\/+$/, "");
}

function defaultProviderOrder(): Array<"ollama" | "openai"> {
  // AI_PROVIDER can be: "ollama", "openai", or "auto"
  const p = env("AI_PROVIDER", "auto").toLowerCase();
  if (p === "ollama") return ["ollama", "openai"];
  if (p === "openai") return ["openai", "ollama"];
  return ["ollama", "openai"]; // auto default
}

function shouldSendOpenAITemperature(model: string) {
  // safest default: NO temperature for reasoning models
  // If you want to force it for a known temp-supporting model, set:
  // OPENAI_ALLOW_TEMPERATURE=1
  if (env("OPENAI_ALLOW_TEMPERATURE") === "1") return true;

  const m = (model || "").toLowerCase();

  // Known families that generally support temp (non-reasoning chat models)
  if (m.startsWith("gpt-4.1")) return true;
  if (m.startsWith("gpt-4o")) return true;
  if (m.startsWith("gpt-4")) return true;
  if (m.startsWith("gpt-3.5")) return true;

  // gpt-5 / o-series: default to false to avoid 400s
  return false;
}

/* ---------------- Ollama ---------------- */

async function ollamaChat(args: LlmTextArgs): Promise<LlmTextResult> {
  const baseUrl = normalizeBaseUrl(env("OLLAMA_BASE_URL", "http://127.0.0.1:11434"));
  const model = env("OLLAMA_MODEL", "llama3.1:8b");

  const body: any = {
    model,
    stream: false,
    messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
  };

  // Ollama supports temperature via "options"
  if (typeof args.temperature === "number") {
    body.options = { ...(body.options || {}), temperature: args.temperature };
  }

  // Rough mapping: tokens -> num_predict
  if (typeof args.maxTokens === "number") {
    body.options = { ...(body.options || {}), num_predict: args.maxTokens };
  }

  // If you want, Ollama can accept format: "json" (newer builds).
  // This is optional; your prompt already demands strict JSON.
  if (args.json) {
    body.format = "json";
  }

  const r = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(j?.error || `Ollama error (${r.status})`);
  }

  const content = String(j?.message?.content ?? "").trim();
  if (!content) throw new Error("Ollama returned empty content");

  return { content, provider: "ollama", model };
}

/* ---------------- OpenAI ---------------- */

async function openaiResponses(args: LlmTextArgs): Promise<LlmTextResult> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = env("OPENAI_MODEL", env("AI_MODEL", "gpt-5.2"));

  // Convert to Responses API input format:
  // We'll send a single "input" array of role/content objects.
  const input = args.messages.map((m) => ({
    role: m.role,
    content: [{ type: "text", text: m.content }],
  }));

  const payload: any = {
    model,
    input,
  };

  // Token cap
  if (typeof args.maxTokens === "number") {
    payload.max_output_tokens = args.maxTokens;
  }

  // JSON mode (optional). If your account/model doesn’t support this, your parser will still enforce JSON.
  if (args.json) {
    payload.text = { format: { type: "json_object" } };

  }

  // CRITICAL FIX:
  // Only send temperature when we know it’s safe.
  if (typeof args.temperature === "number" && shouldSendOpenAITemperature(model)) {
    payload.temperature = args.temperature;
  }

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = j?.error?.message || j?.message || `OpenAI error (${r.status})`;
    throw new Error(msg);
  }

  // Responses API gives either output_text or an output array.
  const text =
    (typeof j?.output_text === "string" && j.output_text.trim()) ||
    String(j?.output?.[0]?.content?.[0]?.text ?? "").trim();

  if (!text) throw new Error("OpenAI returned empty content");

  return { content: text, provider: "openai", model };
}

/* ---------------- Public API ---------------- */

export async function llmText(args: LlmTextArgs): Promise<LlmTextResult> {
  const order = defaultProviderOrder();

  let lastErr: any = null;

  for (const provider of order) {
    try {
      if (provider === "ollama") return await ollamaChat(args);
      if (provider === "openai") return await openaiResponses(args);
    } catch (e: any) {
      lastErr = e;
      // keep trying next provider
    }
  }

  throw new Error(String(lastErr?.message ?? lastErr ?? "LLM failed"));
}
