"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export interface SignaturePadProps {
  /** Called after each stroke with a cropped, transparent PNG, or null when the pad is empty. */
  onChange: (png: Blob | null) => void;
  disabled?: boolean;
}

type Point = { x: number; y: number };

// Internal drawing resolution; CSS scales it to the container width.
const PAD_WIDTH = 900;
const PAD_HEIGHT = 300;
const LINE_WIDTH = 8;
const EXPORT_PADDING = 12;

// Ink colors are part of the signature file, not interface chrome, so they are
// data here rather than theme tokens.
const INK_OPTIONS = [
  { value: "#111827", label: "Black" },
  { value: "#1d3a8a", label: "Blue" },
] as const;

function drawStroke(context: CanvasRenderingContext2D, stroke: Point[]): void {
  if (stroke.length === 0) return;
  if (stroke.length === 1) {
    context.beginPath();
    context.arc(stroke[0].x, stroke[0].y, LINE_WIDTH / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.beginPath();
  context.moveTo(stroke[0].x, stroke[0].y);
  for (let i = 1; i < stroke.length - 1; i++) {
    const midX = (stroke[i].x + stroke[i + 1].x) / 2;
    const midY = (stroke[i].y + stroke[i + 1].y) / 2;
    context.quadraticCurveTo(stroke[i].x, stroke[i].y, midX, midY);
  }
  const last = stroke[stroke.length - 1];
  context.lineTo(last.x, last.y);
  context.stroke();
}

/** A freehand signature pad. Drawing needs a pointer, so the page offers an image upload as the other route. */
export function SignaturePad({ onChange, disabled }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [ink, setInk] = useState<string>(INK_OPTIONS[0].value);

  const redraw = useCallback((color: string) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = LINE_WIDTH;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = color;
    context.fillStyle = color;
    for (const stroke of strokes.current) drawStroke(context, stroke);
  }, []);

  const exportPng = useCallback(
    (color: string): Promise<Blob | null> => {
      const all = strokes.current.flat();
      if (all.length === 0) return Promise.resolve(null);
      const margin = LINE_WIDTH / 2 + EXPORT_PADDING;
      const minX = Math.max(0, Math.min(...all.map((p) => p.x)) - margin);
      const minY = Math.max(0, Math.min(...all.map((p) => p.y)) - margin);
      const maxX = Math.min(PAD_WIDTH, Math.max(...all.map((p) => p.x)) + margin);
      const maxY = Math.min(PAD_HEIGHT, Math.max(...all.map((p) => p.y)) + margin);

      const source = canvasRef.current;
      if (!source) return Promise.resolve(null);
      redraw(color);
      const cropped = document.createElement("canvas");
      cropped.width = Math.max(1, Math.round(maxX - minX));
      cropped.height = Math.max(1, Math.round(maxY - minY));
      cropped.getContext("2d")?.drawImage(source, -minX, -minY);
      return new Promise((resolve) => cropped.toBlob((blob) => resolve(blob), "image/png"));
    },
    [redraw],
  );

  useEffect(() => {
    redraw(ink);
  }, [ink, redraw]);

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * PAD_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * PAD_HEIGHT,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    strokes.current.push([pointFromEvent(event)]);
    setHasInk(true);
    redraw(ink);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const stroke = strokes.current[strokes.current.length - 1];
    stroke.push(pointFromEvent(event));
    redraw(ink);
  }

  async function handlePointerEnd() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(await exportPng(ink));
  }

  async function handleInkChange(color: string) {
    setInk(color);
    if (strokes.current.length > 0) onChange(await exportPng(color));
  }

  function handleClear() {
    strokes.current = [];
    setHasInk(false);
    redraw(ink);
    onChange(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-md border border-border-strong bg-paper">
        <canvas
          ref={canvasRef}
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          role="img"
          aria-label="Signature drawing area. Draw with a mouse, finger, or pen. To sign without drawing, upload an image instead."
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          className="block aspect-[3/1] w-full touch-none cursor-crosshair"
        />
        {!hasInk && (
          <p
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-sm text-paper-foreground"
          >
            Draw your signature here
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex items-center gap-4" disabled={disabled}>
          <legend className="sr-only">Ink color</legend>
          {INK_OPTIONS.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="signature-ink"
                checked={ink === option.value}
                onChange={() => handleInkChange(option.value)}
                className="h-4 w-4 accent-accent"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <Button type="button" variant="secondary" size="sm" disabled={disabled || !hasInk} onClick={handleClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}
