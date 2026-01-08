"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  sessionId: string;
  maxAttempts?: number;   // total reloads max
  intervalMs?: number;    // delay between reloads
};

export default function AutoRefresh({
  sessionId,
  maxAttempts = 6,
  intervalMs = 2500,
}: Props) {
  const key = useMemo(() => `lc_success_refresh_${sessionId}`, [sessionId]);
  const [attempt, setAttempt] = useState<number>(0);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      const n = raw ? Number(raw) : 0;
      const safe = Number.isFinite(n) ? n : 0;
      setAttempt(safe);
    } catch {
      // ignore
    }
  }, [key]);

  useEffect(() => {
    // stop if we already hit the cap
    if (attempt >= maxAttempts) return;

    const t = window.setTimeout(() => {
      try {
        sessionStorage.setItem(key, String(attempt + 1));
      } catch {
        // ignore
      }
      window.location.reload();
    }, intervalMs);

    return () => window.clearTimeout(t);
  }, [attempt, intervalMs, key, maxAttempts]);

  if (attempt >= maxAttempts) return null;

  return (
    <p className="mt-3 text-sm text-white/60">
      Finalizing your order… auto-refreshing ({attempt + 1}/{maxAttempts})
    </p>
  );
}
