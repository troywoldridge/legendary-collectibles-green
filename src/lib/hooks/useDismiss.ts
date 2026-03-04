"use client";

import * as React from "react";

/**
 * Close on Escape (when enabled)
 */
export function useOnEscape(onEscape: () => void, enabled: boolean = true) {
  React.useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onEscape();
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onEscape, enabled]);
}

/**
 * Close when clicking/tapping outside of ref element (when enabled)
 *
 * NOTE:
 * - Ref is always nullable in React (`current` can be null), so we accept T | null.
 * - Uses pointerdown in capture phase so it runs before other handlers.
 */
export function useOnClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onOutside: () => void,
  enabled: boolean = true
) {
  React.useEffect(() => {
    if (!enabled) return;

    function onPointerDown(e: PointerEvent) {
      const el = ref.current;
      if (!el) return;

      const target = e.target as Node | null;
      if (!target) return;

      if (!el.contains(target)) onOutside();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [ref, onOutside, enabled]);
}
