"use client";

import { useMemo, useState } from "react";

const SUGGESTED = [
  "How long do orders take to ship?",
  "How do returns work?",
  "What’s the difference between PSA 9 and PSA 10?",
  "Do you guarantee authenticity?",
];

type AskOk = { answer: string; sources?: string[] };
type AskErr = { error?: string; message?: string };
type AskResponse = AskOk | AskErr;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseAskResponse(v: unknown): AskResponse | null {
  if (!isObject(v)) return null;

  const answer = v["answer"];
  const error = v["error"];
  const message = v["message"];

  const out: AskResponse = {};
  if (typeof answer === "string") (out as AskOk).answer = answer;
  if (typeof error === "string") (out as AskErr).error = error;
  if (typeof message === "string") (out as AskErr).message = message;

  // If it's totally empty, treat as invalid
  if (!("answer" in out) && !("error" in out) && !("message" in out)) return null;
  return out;
}

export default function AskLegendaryWidget() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const canAsk = useMemo(() => question.trim().length > 0 && status !== "loading", [question, status]);

  async function ask(q?: string) {
    const finalQ = (q ?? question).trim();
    if (!finalQ) return;

    setStatus("loading");
    setAnswer("");

    try {
      const res = await fetch("/api/ai/ask-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: finalQ }),
      });

      const raw: unknown = await res.json().catch(() => null);
      const data = parseAskResponse(raw);

      if (!res.ok) {
        setStatus("error");
        const msg =
          (data && "message" in data && typeof data.message === "string" && data.message) ||
          (data && "error" in data && typeof data.error === "string" && data.error) ||
          "Something went wrong. Please try again.";
        setAnswer(msg);
        return;
      }

      const out =
        (data && "answer" in data && typeof data.answer === "string" && data.answer) ||
        "Sorry, I don’t have that information.";

      setStatus("idle");
      setAnswer(out);
    } catch {
      setStatus("error");
      setAnswer("Network error. Please try again.");
    }
  }

  return (
    <section className="aiWidget">
      <div className="aiWidgetHeader">
        <h2 className="aiWidgetTitle">Ask Legendary</h2>
        <p className="aiWidgetSubtitle">Quick answers from our shop policies and guides.</p>
      </div>

      <div className="aiWidgetRow">
        <input
          className="aiWidgetInput"
          value={question}
          onChange={(ev) => setQuestion(ev.target.value)}
          placeholder="Ask about shipping, returns, PSA grading..."
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && canAsk) ask();
          }}
        />
        <button className="aiWidgetButton" onClick={() => ask()} disabled={!canAsk} type="button">
          {status === "loading" ? "Thinking..." : "Ask"}
        </button>
      </div>

      <div className="aiWidgetChips">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            className="aiWidgetChip"
            onClick={() => {
              setQuestion(s);
              ask(s);
            }}
            disabled={status === "loading"}
            type="button"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="aiWidgetAnswer" aria-live="polite">
        {answer ? <p>{answer}</p> : <p className="aiWidgetHint">Try a question above.</p>}
      </div>
    </section>
  );
}
