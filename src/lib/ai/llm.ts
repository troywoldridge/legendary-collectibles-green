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
  const p = env("AI_PROVIDER", "auto").toLowerCase();
  if (p === "ollama") return ["ollama", "openai"];
  if (p === "openai") return ["openai", "ollama"];
  return ["ollama", "openai"];
}

function shouldSendOpenAITemperature(model: string) {
  if (env("OPENAI_ALLOW_TEMPERATURE") === "1") return true;

  const m = (model || "").toLowerCase();
  if (m.startsWith("gpt-4.1")) return true;
  if (m.startsWith("gpt-4o")) return true;
  if (m.startsWith("gpt-4")) return true;
  if (m.startsWith("gpt-3.5")) return true;

  // gpt-5 / o-series / reasoning families: default false
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

  if (typeof args.temperature === "number") {
    body.options = { ...(body.options || {}), temperature: args.temperature };
  }

  if (typeof args.maxTokens === "number") {
    body.options = { ...(body.options || {}), num_predict: args.maxTokens };
  }

  if (args.json) body.format = "json";

  const r = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error || `Ollama error (${r.status})`);

  const content = String(j?.message?.content ?? "").trim();
  if (!content) throw new Error("Ollama returned empty content");

  return { content, provider: "ollama", model };
}

/* ---------------- OpenAI (Responses API) ---------------- */

function extractTextFromResponsesPayload(j: any): string {
  // 1) Helper field (often present)
  const direct = typeof j?.output_text === "string" ? j.output_text.trim() : "";
  if (direct) return direct;

  // 2) Walk output[] and collect output_text + summary_text parts
  const outputs = Array.isArray(j?.output) ? j.output : [];
  const chunks: string[] = [];

  for (const item of outputs) {
    const parts = Array.isArray(item?.content) ? item.content : [];
    for (const part of parts) {
      // output_text is the usual
      if (part?.type === "output_text" && typeof part?.text === "string" && part.text.trim()) {
        chunks.push(part.text.trim());
        continue;
      }

      // some responses include summary_text instead
      if (part?.type === "summary_text" && typeof part?.text === "string" && part.text.trim()) {
        chunks.push(part.text.trim());
        continue;
      }

      // refusals can arrive as structured parts
      if (part?.type === "refusal") {
        const reason =
          (typeof part?.refusal === "string" && part.refusal.trim()) || "Refused without a reason.";
        throw new Error(`OpenAI refusal: ${reason}`);
      }

      // ultra-defensive fallback: if it has a text field, use it
      if (typeof part?.text === "string" && part.text.trim()) {
        chunks.push(part.text.trim());
      }
    }
  }

  return chunks.join("\n").trim();
}

function pickMaxOutputTokens(original?: number): number | undefined {
  if (typeof original !== "number" || !Number.isFinite(original) || original <= 0) return undefined;
  return Math.max(256, Math.trunc(original));
}

async function openaiFetchResponses(payload: any): Promise<any> {
  const apiKey = env("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

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

  return j;
}

async function openaiResponses(args: LlmTextArgs): Promise<LlmTextResult> {
  const model = env("OPENAI_MODEL", env("AI_MODEL", "gpt-5.2"));

  const input = args.messages.map((m) => ({
    role: m.role,
    content: [{ type: "input_text", text: m.content }],
  }));

  const payloadBase: any = { model, input };

  const maxOut = pickMaxOutputTokens(args.maxTokens);
  if (typeof maxOut === "number") payloadBase.max_output_tokens = maxOut;

  if (args.json) {
    payloadBase.text = { format: { type: "json_object" } };
  }

  if (typeof args.temperature === "number" && shouldSendOpenAITemperature(model)) {
    payloadBase.temperature = args.temperature;
  }

  // Attempt #1
  const j1 = await openaiFetchResponses(payloadBase);

  let text1 = "";
  try {
    text1 = extractTextFromResponsesPayload(j1);
  } catch (e) {
    // refusal or extraction error: rethrow
    throw e;
  }

  if (text1) return { content: text1, provider: "openai", model };

  // If the model says incomplete and we got nothing, do ONE retry with more output tokens
  const status1 = typeof j1?.status === "string" ? j1.status : "";
  if (status1 === "incomplete") {
    const base = typeof maxOut === "number" ? maxOut : 1500;
    const bumped = Math.min(4096, Math.max(base * 2, 2000));

    const payload2 = { ...payloadBase, max_output_tokens: bumped };

    const j2 = await openaiFetchResponses(payload2);

    const text2 = extractTextFromResponsesPayload(j2);
    if (text2) return { content: text2, provider: "openai", model };

    const id = j2?.id ? String(j2.id) : String(j1?.id ?? "unknown");
    const status2 = j2?.status ? String(j2.status) : status1 || "unknown";
    throw new Error(`OpenAI returned empty content (id=${id}, status=${status2})`);
  }

  const id = j1?.id ? String(j1.id) : "unknown";
  const status = j1?.status ? String(j1.status) : "unknown";
  throw new Error(`OpenAI returned empty content (id=${id}, status=${status})`);
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
    }
  }

  throw new Error(String(lastErr?.message ?? lastErr ?? "LLM failed"));
}
