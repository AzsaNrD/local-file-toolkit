"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FileText, GripVertical, X } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Lightbox } from "@/components/Lightbox";

export interface FileListItem {
  id: string;
  file: File;
  /** Freeform per-file detail the caller computes, e.g. "12 pages" or "1920x1080". */
  meta?: string;
  thumbnailUrl?: string;
}

export interface FileListProps {
  items: FileListItem[];
  onRemove: (id: string) => void;
  onClearAll: () => void;
  /** Enables drag-to-reorder rows (merge-pdf, image-to-pdf: PRD 10.4). */
  reorderable?: boolean;
  onReorder?: (items: FileListItem[]) => void;
  disabled?: boolean;
}

export function FileList({
  items,
  onRemove,
  onClearAll,
  reorderable = false,
  onReorder,
  disabled,
}: FileListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const lightboxItem = items.find((item) => item.id === lightboxId);

  if (items.length === 0) return null;

  function handleDrop(targetId: string) {
    if (!draggedId || draggedId === targetId || !onReorder) return;
    const fromIndex = items.findIndex((item) => item.id === draggedId);
    const toIndex = items.findIndex((item) => item.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorder(next);
    setDraggedId(null);
  }

  // Keyboard and touch path for reordering: HTML5 drag-and-drop fires for
  // neither. aria-disabled (not disabled) at the ends keeps focus on the
  // button after the row it controls reaches the edge.
  function moveItem(id: string, delta: -1 | 1) {
    if (!onReorder) return;
    const fromIndex = items.findIndex((item) => item.id === id);
    const toIndex = fromIndex + delta;
    if (fromIndex === -1 || toIndex < 0 || toIndex >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorder(next);
    setAnnouncement(`${moved.file.name} moved to position ${toIndex + 1} of ${items.length}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item, index) => (
          <li
            key={item.id}
            draggable={reorderable && !disabled}
            onDragStart={() => setDraggedId(item.id)}
            onDragOver={(event) => reorderable && event.preventDefault()}
            onDrop={() => handleDrop(item.id)}
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-surface px-3 py-2 ${
              draggedId === item.id ? "opacity-50" : ""
            }`}
          >
            {reorderable && (
              <GripVertical
                aria-hidden="true"
                className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
              />
            )}
            {item.thumbnailUrl ? (
              <button
                type="button"
                onClick={() => setLightboxId(item.id)}
                aria-label={`Enlarge preview for ${item.file.name}`}
                className="h-11 w-11 shrink-0 overflow-hidden rounded focus-ring"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a Next-optimizable remote asset */}
                <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              </button>
            ) : (
              <FileText aria-hidden="true" className="h-6 w-6 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1 basis-32">
              <p className="truncate text-sm font-medium text-foreground">{item.file.name}</p>
              <p className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatBytes(item.file.size)}
                {item.meta ? ` · ${item.meta}` : ""}
              </p>
            </div>
            <div className="ml-auto flex items-center">
              {reorderable && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    aria-disabled={index === 0 || undefined}
                    aria-label={`Move ${item.file.name} up`}
                    onClick={() => moveItem(item.id, -1)}
                    className={index === 0 ? "opacity-40" : ""}
                  >
                    <ChevronUp aria-hidden="true" className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    aria-disabled={index === items.length - 1 || undefined}
                    aria-label={`Move ${item.file.name} down`}
                    onClick={() => moveItem(item.id, 1)}
                    className={index === items.length - 1 ? "opacity-40" : ""}
                  >
                    <ChevronDown aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={`Remove ${item.file.name}`}
                onClick={() => onRemove(item.id)}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={onClearAll}
        className="self-start"
      >
        Clear all
      </Button>
      {lightboxItem?.thumbnailUrl && (
        <Lightbox
          src={lightboxItem.thumbnailUrl}
          alt={lightboxItem.file.name}
          onClose={() => setLightboxId(null)}
        />
      )}
    </div>
  );
}
