"use client";

import { useEffect } from "react";

/** Typing targets that must KEEP focus when tapped/clicked. */
const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [role="textbox"]';

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  return el.matches(EDITABLE_SELECTOR) || (el as HTMLElement).isContentEditable === true;
}

/**
 * Global soft-keyboard / focus dismissal: blur the focused text input when the
 * user taps/clicks anything that is not itself a typing target, and on Escape.
 * Mounted once at the app shell so every route (all auth pages + every form)
 * inherits it. Capture phase so it runs before per-component handlers.
 * Enter-to-submit already works via native <form> semantics — not re-added here.
 */
export function useDismissKeyboard(): void {
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const active = document.activeElement;
      if (!isEditable(active)) return;
      const target = e.target as Element | null;
      if (target && target.closest(EDITABLE_SELECTOR)) return; // tapped another field → keep focus
      (active as HTMLElement).blur();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (isEditable(active)) (active as HTMLElement).blur();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
}
