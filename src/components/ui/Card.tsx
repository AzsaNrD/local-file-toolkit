import type { HTMLAttributes } from "react";

// Cards take the slightly larger --radius-card (rounded-lg) while controls use
// the tighter --radius-control (rounded-md): both sharp, one step apart (R-11).
// The corner tick is the HUD identity motif: static, one per card, decorative only.
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`relative rounded-lg border border-border bg-surface p-4 before:pointer-events-none before:absolute before:-left-px before:-top-px before:h-2.5 before:w-2.5 before:rounded-tl-lg before:border-l-2 before:border-t-2 before:border-accent sm:p-6 ${className}`}
      {...props}
    />
  );
}
