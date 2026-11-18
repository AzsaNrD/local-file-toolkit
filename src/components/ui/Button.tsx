import { forwardRef, useId } from "react";
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * What is missing, shown beside the button while it is disabled. Pass null when the button is
   * enabled or the reason is already on the page; leave it undefined for a plain button.
   */
  hint?: string | null;
}

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium " +
  "transition-[color,background-color,border-color,box-shadow,transform] duration-150 " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-50 focus-ring";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:shadow-glow",
  secondary: "bg-surface text-foreground border border-border-strong hover:border-accent hover:text-accent",
  ghost: "text-foreground hover:bg-muted hover:text-accent",
  destructive: "bg-danger text-danger-foreground hover:opacity-90",
};

// Both sizes keep a 44px minimum height (PRD NF7 / R-03 tap target rule);
// "sm" only trims horizontal padding for tight spaces like a file-row action.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-11 min-w-11 px-3 text-sm",
  md: "h-11 min-w-11 px-5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", type = "button", hint, ...props },
  ref,
) {
  const hintId = useId();
  const showHint = Boolean(props.disabled && hint);

  const button = (
    <button
      ref={ref}
      type={type}
      aria-describedby={showHint ? hintId : undefined}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );

  // The wrapper stays whenever a hint prop is passed, so the button is not rebuilt (and the
  // layout does not jump) as it flips between disabled and ready.
  if (hint === undefined) return button;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 self-start">
      {button}
      {showHint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
});
