// src/components/ConsoleBinder.tsx
"use client";

import { useEffect } from "react";

const METHODS = ["log", "info", "warn", "error", "debug"] as const;
type Method = typeof METHODS[number];

// The shape of a console method
type ConsoleFn = (...args: unknown[]) => void;
// Tag so we don't re-bind during HMR
type BoundConsoleFn = ConsoleFn & { __boundToConsole?: true };

export default function ConsoleBinder() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.console) return;
    const c: Console = window.console;

    try {
      METHODS.forEach((k: Method) => {
        const current = c[k] as unknown as BoundConsoleFn | undefined;
        if (typeof current === "function" && !current.__boundToConsole) {
          const bound = current.bind(c) as BoundConsoleFn;
          bound.__boundToConsole = true;

          // Assign back in a type-safe way
          (c as unknown as Record<Method, ConsoleFn>)[k] = bound;
        }
      });
    } catch {
      // ignore — binding is best-effort
    }
  }, []);

  return null;
}
