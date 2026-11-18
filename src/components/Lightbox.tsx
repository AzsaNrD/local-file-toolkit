"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/** A single enlarged preview, dismissed by Escape, a backdrop click, or the close button. */
export function Lightbox({ src, alt, onClose }: LightboxProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // Parents pass a fresh inline callback every render; reading it through a
  // ref keeps the effect below from re-running (and re-grabbing focus) each time.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    // Restore focus to whatever opened the preview once it closes.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // The only focusable element is the close button, so Tab has nowhere
    // useful to go: keep it on the button instead of leaking behind the dialog.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6"
      onClick={onClose}
    >
      <button
        ref={closeButtonRef}
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-md border border-border-strong bg-surface text-foreground hover:border-accent hover:text-accent focus-ring"
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob/data URL, not a remote/optimizable asset */}
      <img
        src={src}
        alt={alt}
        onClick={(event) => event.stopPropagation()}
        className="max-h-full max-w-full rounded-md border border-border object-contain"
      />
    </div>
  );
}
