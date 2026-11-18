"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface PageThumbnailItem {
  key: number;
  dataUrl: string;
  label?: string;
}

export interface PageThumbnailGridProps {
  items: PageThumbnailItem[];
  isSelected?: (key: number) => boolean;
  onSelect?: (key: number) => void;
  /** Live rotation preview in degrees, applied as a CSS transform only. */
  rotation?: (key: number) => number;
  /** Extra content pinned to the top-right of each cell (badges, per-page controls). */
  renderBadge?: (key: number) => React.ReactNode;
  /**
   * Real controls shown under each thumbnail, outside the preview frame, so
   * they can be full-size tap targets (the frame is too small to hold two).
   */
  renderActions?: (key: number) => React.ReactNode;
  reorderable?: boolean;
  onReorder?: (newOrderKeys: number[]) => void;
  disabled?: boolean;
  /**
   * Opens a larger preview of this page. Ignored when `onSelect` is set:
   * a grid can't own both a selection click and a zoom click at once.
   */
  onThumbnailClick?: (key: number) => void;
}

/** The one thumbnail pipeline every page-level PDF tool shares (PRD 12.2). */
export function PageThumbnailGrid({
  items,
  isSelected,
  onSelect,
  rotation,
  renderBadge,
  renderActions,
  reorderable = false,
  onReorder,
  disabled,
  onThumbnailClick,
}: PageThumbnailGridProps) {
  const [draggedKey, setDraggedKey] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Cells holding 44px controls need more width than a 3-up grid gives on a phone.
  const hasControls = reorderable || renderActions !== undefined;

  function handleDrop(targetKey: number) {
    if (draggedKey === null || draggedKey === targetKey || !onReorder) return;
    const keys = items.map((item) => item.key);
    const fromIndex = keys.indexOf(draggedKey);
    const toIndex = keys.indexOf(targetKey);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...keys];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorder(next);
    setDraggedKey(null);
  }

  // Keyboard and touch path for reordering (HTML5 drag-and-drop fires for
  // neither). aria-disabled at the ends keeps focus on the button.
  function moveKey(key: number, delta: -1 | 1) {
    if (!onReorder) return;
    const keys = items.map((item) => item.key);
    const fromIndex = keys.indexOf(key);
    const toIndex = fromIndex + delta;
    if (fromIndex === -1 || toIndex < 0 || toIndex >= keys.length) return;
    const next = [...keys];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorder(next);
    setAnnouncement(`Page ${moved} moved to position ${toIndex + 1} of ${keys.length}`);
  }

  return (
    // Capped height with its own scrollbar (PRD 10.2's Files -> Options ->
    // Action flow needs Options reachable without scrolling past hundreds of
    // pages first (a 200-page PDF would otherwise push everything below it
    // off screen).
    <div className="max-h-[60dvh] overflow-y-auto rounded-md border border-border p-3">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div
        className={`grid gap-3 ${
          hasControls ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4" : "grid-cols-3 sm:grid-cols-4 md:grid-cols-5"
        }`}
      >
        {items.map((item, index) => {
          const selected = isSelected?.(item.key) ?? false;
          const degrees = rotation?.(item.key) ?? 0;
          const frameClassName = `relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md border-2 bg-muted focus-ring ${
            selected ? "border-danger" : "border-border hover:border-accent"
          } ${onSelect || onThumbnailClick ? "cursor-pointer" : reorderable ? "cursor-grab" : "cursor-default"}`;
          const frameContent = (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- local data URL thumbnail, not a remote/optimizable asset */}
              <img
                src={item.dataUrl}
                alt={`Page ${item.label ?? item.key}`}
                className="h-full w-full object-contain transition-transform duration-150"
                style={{ transform: `rotate(${degrees}deg)` }}
              />
              {selected && <div className="absolute inset-0 flex items-center justify-center bg-danger/40" />}
              {renderBadge && (
                <div className="absolute inset-x-0 top-0 flex justify-end p-1">{renderBadge(item.key)}</div>
              )}
            </>
          );

          return (
            <div
              key={item.key}
              draggable={reorderable && !disabled}
              onDragStart={() => setDraggedKey(item.key)}
              onDragOver={(event) => reorderable && event.preventDefault()}
              onDrop={() => handleDrop(item.key)}
              className={`relative flex flex-col items-center gap-1 ${
                draggedKey === item.key ? "opacity-50" : ""
              }`}
            >
              {onSelect ? (
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => onSelect(item.key)}
                  className={frameClassName}
                >
                  {frameContent}
                </button>
              ) : onThumbnailClick ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onThumbnailClick(item.key)}
                  aria-label={`Enlarge page ${item.label ?? item.key}`}
                  className={frameClassName}
                >
                  {frameContent}
                </button>
              ) : (
                // Not a <button>: it does nothing on its own here (rotate-pdf
                // puts real controls in renderBadge), and a disabled <button>
                // would block pointer events on those nested controls too.
                <div className={frameClassName}>{frameContent}</div>
              )}
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{item.label ?? item.key}</span>
              {(reorderable || renderActions) && (
                <div className="flex items-center">
                  {reorderable && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        aria-disabled={index === 0 || undefined}
                        aria-label={`Move page ${item.label ?? item.key} earlier`}
                        onClick={() => moveKey(item.key, -1)}
                        className={`w-11 px-0 ${index === 0 ? "opacity-40" : ""}`}
                      >
                        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        aria-disabled={index === items.length - 1 || undefined}
                        aria-label={`Move page ${item.label ?? item.key} later`}
                        onClick={() => moveKey(item.key, 1)}
                        className={`w-11 px-0 ${index === items.length - 1 ? "opacity-40" : ""}`}
                      >
                        <ChevronRight aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {renderActions?.(item.key)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
