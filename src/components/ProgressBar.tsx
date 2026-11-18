"use client";

import { useEffect, useRef, useState } from "react";

export interface ProgressBarProps {
  /** 0 to 100, or null for an indeterminate operation. */
  progress: number | null;
  label?: string;
  /** What is being worked on right now, for a batch ("File 2 of 5 · name.docx"). */
  detail?: string | null;
}

export function ProgressBar({ progress, label, detail }: ProgressBarProps) {
  const determinate = progress !== null;
  const containerRef = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(0);

  // The Run button unmounts when work starts, which drops keyboard focus to
  // <body>. Only in that case is focus moved here, so it keeps the user
  // anchored and screen readers read the label. Focus still sitting on a real
  // control (e.g. the dropzone while previews render) is left alone.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) {
      containerRef.current?.focus({ preventScroll: true });
    }
  }, []);

  // A long conversion with a bar that does not move reads as frozen; a running clock shows it is not.
  useEffect(() => {
    const timer = setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const readout = [determinate ? `${Math.round(progress)}%` : null, seconds >= 3 ? `${seconds}s` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="progressbar"
      aria-valuenow={determinate ? Math.round(progress) : undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Working"}
      className="flex flex-col gap-2 outline-none"
    >
      <div className="h-2 w-full overflow-hidden rounded-sm bg-muted">
        {determinate ? (
          <div
            className="h-full rounded-sm bg-accent transition-[width] duration-150"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        ) : (
          <div className="animate-progress-slide h-full w-1/3 rounded-sm bg-accent motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
        )}
      </div>
      <div className="flex items-baseline justify-between gap-3 font-mono text-sm text-muted-foreground">
        <p>{label}</p>
        {readout && <p className="shrink-0 tabular-nums">{readout}</p>}
      </div>
      {detail && <p className="break-all font-mono text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
