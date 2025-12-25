"use client";

import React, { useEffect, useMemo, useState } from "react";

type Props = {
  children: React.ReactNode;
  title?: string;
};

export const ADMIN_TOKEN_STORAGE_KEY = "ADMIN_API_TOKEN";

export function getAdminToken(): string {
  try {
    return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function setAdminToken(v: string) {
  try {
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, v);
  } catch {
    // ignore
  }
}

function clearAdminToken() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function AdminTokenGate({ children, title = "Admin Access" }: Props) {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    setMounted(true);
    const t = getAdminToken();
    setToken(t);
    setInput(t);
  }, []);

  const hasToken = useMemo(() => token.trim().length > 0, [token]);

  function save() {
    const t = input.trim();
    if (!t) {
      setMsg("Token cannot be empty.");
      return;
    }
    setAdminToken(t);
    setToken(t);
    setMsg("Saved. Reloading…");
    window.location.reload();
  }

  function clear() {
    clearAdminToken();
    setToken("");
    setInput("");
    setMsg("Cleared.");
  }

  if (!mounted) {
    return (
      <div className="adminGate">
        <h1 className="adminGate__title">{title}</h1>
        <p className="adminGate__muted">Loading admin gate…</p>
      </div>
    );
  }

  if (hasToken) return <>{children}</>;

  return (
    <div className="adminGate">
      <h1 className="adminGate__title">{title}</h1>
      <p className="adminGate__muted">
        This admin area is protected. Paste the <b>ADMIN_API_TOKEN</b> to continue.
      </p>

      <div className="adminGate__panel">
        <label className="adminGate__label">
          <span className="adminGate__labelText">Admin API Token</span>
          <input
            className="adminGate__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            type={show ? "text" : "password"}
            placeholder="Paste token here…"
          />
        </label>

        <div className="adminGate__actions">
          <button className="adminGate__btn adminGate__btn--primary" onClick={save}>
            Save Token
          </button>
          <button className="adminGate__btn" onClick={() => setShow((s) => !s)}>
            {show ? "Hide" : "Show"}
          </button>
          <button className="adminGate__btn adminGate__btn--danger" onClick={clear}>
            Clear Token
          </button>
        </div>

        {msg ? <div className="adminGate__msg">{msg}</div> : null}

        <details className="adminGate__details">
          <summary className="adminGate__summary">Where do I get the token?</summary>
          <div className="adminGate__help">
            <div>1) Generate one:</div>
            <pre className="adminGate__code">
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
            </pre>
            <div>2) Put it in <code>.env</code>:</div>
            <pre className="adminGate__code">ADMIN_API_TOKEN=PASTE_TOKEN_HERE</pre>
            <div>3) Restart the app / redeploy, then paste it here.</div>
          </div>
        </details>
      </div>
    </div>
  );
}
