"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRightLeft, ChevronDown } from "lucide-react";
import { compatibleTools, setHandoff } from "@/lib/handoff";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/categories";
import { useDismissable } from "@/hooks/useDismissable";
import type { OutputFile } from "@/lib/types";

export interface UseInAnotherToolProps {
  outputs: OutputFile[];
  /** The files as the user would download them, with any name changes applied. */
  getFiles: () => File[];
}

/** Opens the result in another tool directly, skipping the download and re-upload. Renders nothing when no tool fits. */
export function UseInAnotherTool({ outputs, getFiles }: UseInAnotherToolProps) {
  const pathname = usePathname();
  const currentSlug = pathname.startsWith("/tools/") ? pathname.split("/")[2] : null;
  const [open, setOpen] = useState(false);
  // Chosen when the menu opens: it goes below the button when there is room, otherwise above,
  // and its height is capped to the room it has so it never runs into the screen edge.
  const [placement, setPlacement] = useState<{ above: boolean; maxHeight: number }>({
    above: false,
    maxHeight: 360,
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismissable(open, close, containerRef, buttonRef);

  const tools = useMemo(() => compatibleTools(outputs, currentSlug), [outputs, currentSlug]);
  if (tools.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const edge = 16; // breathing room between the menu and the screen edge
            const gap = 4;
            const below = window.innerHeight - rect.bottom - edge - gap;
            const above = rect.top - edge - gap;
            // Enough for the category headings plus a few tool rows.
            const comfortable = 260;
            const placeAbove = below < comfortable && above > below;
            setPlacement({
              above: placeAbove,
              maxHeight: Math.max(160, Math.min(placeAbove ? above : below, 420)),
            });
          }
          setOpen((current) => !current);
        }}
        className="inline-flex h-11 items-center gap-2 rounded-md border border-border-strong bg-surface px-5 text-sm font-medium text-foreground transition-[color,border-color] duration-150 hover:border-accent hover:text-accent focus-ring"
      >
        <ArrowRightLeft aria-hidden="true" className="h-4 w-4" />
        Use in another tool
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <nav
          id={panelId}
          aria-label="Tools that can open this result"
          style={{ maxHeight: placement.maxHeight }}
          className={`absolute left-0 z-20 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border-strong bg-surface p-2 ${
            placement.above ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {CATEGORY_ORDER.map((category) => {
            const inCategory = tools.filter((tool) => tool.category === category);
            if (inCategory.length === 0) return null;
            return (
              <div key={category} role="group" aria-label={CATEGORY_LABELS[category]}>
                <p
                  aria-hidden="true"
                  className="px-3 pb-1 pt-2 font-mono text-xs font-semibold text-muted-foreground"
                >
                  {CATEGORY_LABELS[category]}
                </p>
                <ul>
                  {inCategory.map((tool) => (
                    <li key={tool.slug}>
                      <Link
                        href={`/tools/${tool.slug}`}
                        onClick={() => {
                          setHandoff(getFiles());
                          setOpen(false);
                        }}
                        className="flex min-h-11 items-center rounded-md px-3 text-sm text-foreground hover:bg-muted hover:text-accent focus-ring"
                      >
                        {tool.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      )}
    </div>
  );
}
