/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "ADMIN_UI_TOKEN";

let memoryToken: string | null = null;

function safeGetLocalStorage(key: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeRemoveLocalStorage(key: string) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Read the admin token from memory (fast) or localStorage.
 * NOTE: This is client-only.
 */
export function getAdminToken(): string | null {
  if (memoryToken && memoryToken.trim()) return memoryToken.trim();
  const fromLs = safeGetLocalStorage(STORAGE_KEY);
  if (fromLs && fromLs.trim()) {
    memoryToken = fromLs.trim();
    return memoryToken;
  }
  return null;
}

export function setAdminToken(token: string) {
  const t = String(token ?? "").trim();
  memoryToken = t || null;
  if (t) safeSetLocalStorage(STORAGE_KEY, t);
  else safeRemoveLocalStorage(STORAGE_KEY);
}

export function clearAdminToken() {
  memoryToken = null;
  safeRemoveLocalStorage(STORAGE_KEY);
}

type Props = {
  children: React.ReactNode;
  title?: string;
  description?: string;
};

export default function AdminApiTokenGate({
  children,
  title = "Admin Access",
  description = "Enter your admin token to use these tools.",
}: Props) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string>("");
  const [savedToken, setSavedTokenState] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // hydrate from storage once on mount
  useEffect(() => {
    const existing = getAdminToken();
    setSavedTokenState(existing);
    setToken(existing ?? "");
    setReady(true);
  }, []);

  const hasToken = useMemo(() => !!(savedToken && savedToken.trim()), [savedToken]);

  function onSave() {
    setErr(null);
    const t = token.trim();
    if (!t) {
      setErr("Token is required.");
      return;
    }
    setAdminToken(t);
    setSavedTokenState(t);
  }

  function onClear() {
    setErr(null);
    clearAdminToken();
    setSavedTokenState(null);
    setToken("");
  }

  if (!ready) return null;

  if (hasToken) {
    return <>{children}</>;
  }

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{title}</div>
          <div className="mt-1 text-sm opacity-70">{description}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="text-sm opacity-80">Admin Token</label>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste token…"
          className="w-full rounded-md bg-black/30 border border-white/10 px-3 py-2"
          autoComplete="off"
          spellCheck={false}
        />

        {err ? <p className="text-sm text-red-300">{err}</p> : null}

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onSave}
            className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
          >
            Save Token
          </button>

          <button
            onClick={onClear}
            className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/5"
          >
            Clear
          </button>
        </div>

        <p className="text-xs opacity-60">
          This token is stored in your browser (localStorage key: <span className="opacity-80">{STORAGE_KEY}</span>).
        </p>
      </div>
    </div>
  );
}
