"use client";

import { useRef, useState } from "react";
import type { CropRect } from "@/lib/image/crop";

export interface CropOverlayProps {
  rect: CropRect;
  onChange: (rect: CropRect) => void;
  /** Width over height of the box in pixels, or null for a free shape. */
  aspect: number | null;
  /** Pixel size of the picture, so an aspect ratio can be held in pixels and not in fractions. */
  naturalWidth: number;
  naturalHeight: number;
  disabled?: boolean;
}

type Drag =
  | { kind: "move"; startX: number; startY: number; origin: CropRect }
  | { kind: "corner"; anchorX: number; anchorY: number }
  | null;

const MIN = 0.02;
const HIT_PX = 24;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * A draggable crop box over a picture: drag inside to move it, drag a corner to resize,
 * drag on the picture outside the box to draw a new one. The number fields next to it on
 * the page are the keyboard route to the same rectangle.
 */
export function CropOverlay({ rect, onChange, aspect, naturalWidth, naturalHeight, disabled }: CropOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag>(null);

  function pointFrom(event: React.PointerEvent): { x: number; y: number } {
    const bounds = containerRef.current!.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width, 0, 1),
      y: clamp((event.clientY - bounds.top) / bounds.height, 0, 1),
    };
  }

  /** The box between a fixed corner and the pointer, held to the aspect ratio when there is one. */
  function boxBetween(anchorX: number, anchorY: number, pointerX: number, pointerY: number): CropRect {
    let dx = pointerX - anchorX;
    let dy = pointerY - anchorY;
    if (aspect) {
      // Work in pixels so 16:9 means 16:9 on the picture, whatever shape the picture is.
      const pixelsW = Math.abs(dx) * naturalWidth;
      const pixelsH = Math.abs(dy) * naturalHeight;
      let fitW = pixelsH > 0 && pixelsW / pixelsH > aspect ? pixelsH * aspect : pixelsW;
      let fitH = fitW / aspect;
      // Keep the box inside the picture on the side the pointer is heading.
      const roomW = (dx >= 0 ? 1 - anchorX : anchorX) * naturalWidth;
      const roomH = (dy >= 0 ? 1 - anchorY : anchorY) * naturalHeight;
      const shrink = Math.min(1, fitW > 0 ? roomW / fitW : 1, fitH > 0 ? roomH / fitH : 1);
      fitW *= shrink;
      fitH *= shrink;
      dx = (dx >= 0 ? 1 : -1) * (fitW / naturalWidth);
      dy = (dy >= 0 ? 1 : -1) * (fitH / naturalHeight);
    }
    const x = dx >= 0 ? anchorX : anchorX + dx;
    const y = dy >= 0 ? anchorY : anchorY + dy;
    return { x, y, w: Math.max(MIN, Math.abs(dx)), h: Math.max(MIN, Math.abs(dy)) };
  }

  function handleDown(event: React.PointerEvent) {
    if (disabled) return;
    const bounds = containerRef.current!.getBoundingClientRect();
    const p = pointFrom(event);
    event.currentTarget.setPointerCapture(event.pointerId);

    const corners = [
      { x: rect.x, y: rect.y, anchorX: rect.x + rect.w, anchorY: rect.y + rect.h },
      { x: rect.x + rect.w, y: rect.y, anchorX: rect.x, anchorY: rect.y + rect.h },
      { x: rect.x, y: rect.y + rect.h, anchorX: rect.x + rect.w, anchorY: rect.y },
      { x: rect.x + rect.w, y: rect.y + rect.h, anchorX: rect.x, anchorY: rect.y },
    ];
    const hit = corners.find(
      (corner) =>
        Math.abs(corner.x - p.x) * bounds.width <= HIT_PX &&
        Math.abs(corner.y - p.y) * bounds.height <= HIT_PX,
    );
    if (hit) {
      setDrag({ kind: "corner", anchorX: hit.anchorX, anchorY: hit.anchorY });
    } else if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
      setDrag({ kind: "move", startX: p.x, startY: p.y, origin: rect });
    } else {
      setDrag({ kind: "corner", anchorX: p.x, anchorY: p.y });
      onChange({ x: p.x, y: p.y, w: MIN, h: MIN });
    }
  }

  function handleMove(event: React.PointerEvent) {
    if (!drag) return;
    const p = pointFrom(event);
    if (drag.kind === "move") {
      onChange({
        ...drag.origin,
        x: clamp(drag.origin.x + p.x - drag.startX, 0, 1 - drag.origin.w),
        y: clamp(drag.origin.y + p.y - drag.startY, 0, 1 - drag.origin.h),
      });
    } else {
      onChange(boxBetween(drag.anchorX, drag.anchorY, p.x, p.y));
    }
  }

  const percent = (value: number) => `${value * 100}%`;

  return (
    <div
      ref={containerRef}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
      className={`absolute inset-0 touch-none select-none overflow-hidden ${disabled ? "" : "cursor-crosshair"}`}
    >
      {/* The area that will be removed is dimmed; the box itself is left clear. */}
      <div
        aria-hidden="true"
        className="absolute border border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
        style={{ left: percent(rect.x), top: percent(rect.y), width: percent(rect.w), height: percent(rect.h) }}
      >
        {["-left-1.5 -top-1.5", "-right-1.5 -top-1.5", "-bottom-1.5 -left-1.5", "-bottom-1.5 -right-1.5"].map(
          (position) => (
            <span key={position} className={`absolute h-3 w-3 border border-accent bg-background ${position}`} />
          ),
        )}
      </div>
    </div>
  );
}
