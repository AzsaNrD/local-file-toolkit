import { forwardRef, useId } from "react";
import type { InputHTMLAttributes } from "react";

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  /** How the current value is displayed next to the label, e.g. "85%". */
  formatValue?: (value: number) => string;
}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { label, value, onChange, formatValue, id, className = "", ...props },
  ref,
) {
  const generatedId = useId();
  const sliderId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={sliderId} className="text-sm font-medium text-foreground">
            {label}
          </label>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {formatValue ? formatValue(value) : value}
          </span>
        </div>
      )}
      <input
        ref={ref}
        id={sliderId}
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`h-11 w-full cursor-pointer accent-accent focus-ring ${className}`}
        {...props}
      />
    </div>
  );
});
