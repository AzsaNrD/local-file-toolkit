import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const FIELD_BASE =
  "h-11 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus-ring focus-visible:border-accent " +
  "disabled:opacity-50 disabled:pointer-events-none";

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, id, className = "", "aria-describedby": describedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`${FIELD_BASE} ${error ? "border-danger" : ""} ${className}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={[describedBy, hintId, errorId].filter(Boolean).join(" ") || undefined}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
