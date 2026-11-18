"use client";

import {
  CATEGORY_ORDER,
  CATEGORY_SHORT_LABELS,
  type CategoryFilterValue,
} from "@/lib/categories";

export interface CategoryFilterProps {
  value: CategoryFilterValue;
  onChange: (value: CategoryFilterValue) => void;
  /** Tool count per option, shown next to each label. */
  counts: Record<CategoryFilterValue, number>;
}

const OPTIONS: { value: CategoryFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  ...CATEGORY_ORDER.map((category) => ({
    value: category,
    label: CATEGORY_SHORT_LABELS[category],
  })),
];

/**
 * Filters the home grid by category. These are toggle buttons (aria-pressed),
 * not ARIA tabs: they swap which cards are visible on one page rather than
 * switching between separate panels, so each stays a normal Tab stop.
 */
export function CategoryFilter({ value, onChange, counts }: CategoryFilterProps) {
  return (
    <div role="group" aria-label="Filter tools by category" className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-11 items-center gap-2 rounded-md border px-4 font-mono text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-150 focus-ring ${
              selected
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border-strong bg-surface text-foreground hover:border-accent hover:text-accent"
            }`}
          >
            {option.label}
            <span className="tabular-nums opacity-80">{counts[option.value]}</span>
          </button>
        );
      })}
    </div>
  );
}
