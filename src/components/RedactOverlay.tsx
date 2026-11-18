"use client";

import { useRef, useState } from "react";
import type { RedactBox } from "@/lib/pdf/redact";

export interface RedactOverlayProps {
  boxes: RedactBox[];
  onAdd: (box: RedactBox) => void;
  disabled?: boolean;
}

const MIN = 0.008;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Draw black boxes on a page image by dragging. Existing boxes are removed from the list beside it. */
export function RedactOverlay({ boxes, onAdd, disabled }: RedactOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null);

  function pointFrom(event: React.PointerEvent) {
    const bounds = containerRef.current!.getBoundingClientRect();
    return {
      x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height),
    };
  }

  function finish() {
    if (start && current) {
      const box = {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        w: Math.abs(current.x - start.x),
        h: Math.abs(current.y - start.y),
      };
      if (box.w >= MIN && box.h >= MIN) onAdd(box);
    }
    setStart(null);
    setCurrent(null);
  }

  const drawing =
    start && current
      ? {
          x: Math.min(start.x, current.x),
          y: Math.min(start.y, current.y),
          w: Math.abs(current.x - start.x),
          h: Math.abs(current.y - start.y),
        }
      : null;

  const style = (box: RedactBox) => ({
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
  });

  return (
    <div
      ref={containerRef}
      onPointerDown={(event) => {
        if (disabled) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = pointFrom(event);
        setStart(point);
        setCurrent(point);
      }}
      onPointerMove={(event) => start && setCurrent(pointFrom(event))}
      onPointerUp={finish}
      onPointerCancel={() => {
        setStart(null);
        setCurrent(null);
      }}
      className={`absolute inset-0 touch-none select-none ${disabled ? "" : "cursor-crosshair"}`}
    >
      {boxes.map((box, index) => (
        <div key={index} aria-hidden="true" className="absolute border border-danger bg-black/85" style={style(box)} />
      ))}
      {drawing && <div aria-hidden="true" className="absolute border border-danger bg-danger/30" style={style(drawing)} />}
    </div>
  );
}
