"use client";

import { useEffect, type RefObject } from "react";

/**
 * Closes an open disclosure on Escape (returning focus to its button), on a
 * pointer press outside it, or when keyboard focus moves outside it.
 */
export function useDismissable(
  open: boolean,
  close: () => void,
  containerRef: RefObject<HTMLElement | null>,
  buttonRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) close();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    }
    function handleFocusIn(event: FocusEvent) {
      if (!containerRef.current?.contains(event.target as Node)) close();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [open, close, containerRef, buttonRef]);
}
