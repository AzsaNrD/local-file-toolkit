"use client";

import { useCallback, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { TOOLS } from "@/lib/tools";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/categories";
import { useDismissable } from "@/hooks/useDismissable";

export interface ToolSwitcherProps {
  currentSlug: string;
}

/**
 * Jump to another tool without going back to the home page. A disclosure of
 * real links, not a <select> that navigates on change: arrow keys on a closed
 * select would fire navigation as the user browses (WCAG 3.2.2).
 */
export function ToolSwitcher({ currentSlug }: ToolSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, containerRef, buttonRef);

  return (
    <div ref={containerRef} className="sm:relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 font-mono text-sm text-foreground transition-[color,border-color] duration-150 hover:border-accent hover:text-accent focus-ring"
      >
        Switch tool
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <nav
          id={panelId}
          aria-label="All tools"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-[70dvh] overflow-y-auto sm:inset-x-auto sm:left-0 sm:w-72 rounded-lg border border-border-strong bg-surface p-2"
        >
          {CATEGORY_ORDER.map((category) => {
            const tools = TOOLS.filter((tool) => tool.category === category);
            if (tools.length === 0) return null;
            return (
              <div key={category} role="group" aria-label={CATEGORY_LABELS[category]}>
                <p
                  aria-hidden="true"
                  className="px-3 pb-1 pt-2 font-mono text-xs font-semibold text-muted-foreground"
                >
                  {CATEGORY_LABELS[category]}
                </p>
                <ul>
                  {tools.map((tool) => {
                    const current = tool.slug === currentSlug;
                    return (
                      <li key={tool.slug}>
                        <Link
                          href={`/tools/${tool.slug}`}
                          aria-current={current ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={`flex min-h-11 items-center rounded-md px-3 text-sm focus-ring ${
                            current
                              ? "bg-muted font-medium text-accent"
                              : "text-foreground hover:bg-muted hover:text-accent"
                          }`}
                        >
                          {tool.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );
}
