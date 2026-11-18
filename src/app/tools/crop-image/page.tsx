"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import { errors, type AppError } from "@/lib/errors";
import { cropImage, drawTurned, type CropRect, type QuarterTurns } from "@/lib/image/crop";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { CropOverlay } from "@/components/CropOverlay";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToolRun } from "@/hooks/useToolRun";

const tool = getToolBySlug("crop-image")!;

const DEFAULT_RECT: CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
const PREVIEW_WIDTH = 960;

/** "free" and "original" are special; the rest are width:height. */
const ASPECTS: { key: string; label: string; ratio: number | null }[] = [
  { key: "free", label: "Free", ratio: null },
  { key: "original", label: "Original", ratio: -1 },
  { key: "1:1", label: "1:1", ratio: 1 },
  { key: "4:3", label: "4:3", ratio: 4 / 3 },
  { key: "3:2", label: "3:2", ratio: 3 / 2 },
  { key: "16:9", label: "16:9", ratio: 16 / 9 },
  { key: "3:4", label: "3:4", ratio: 3 / 4 },
  { key: "2:3", label: "2:3", ratio: 2 / 3 },
  { key: "9:16", label: "9:16", ratio: 9 / 16 },
];

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** The largest box of this shape that fits inside `rect`, keeping its centre. */
function fitToAspect(rect: CropRect, ratio: number, width: number, height: number): CropRect {
  let pixelsW = rect.w * width;
  let pixelsH = rect.h * height;
  if (pixelsW / pixelsH > ratio) pixelsW = pixelsH * ratio;
  else pixelsH = pixelsW / ratio;
  const w = pixelsW / width;
  const h = pixelsH / height;
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h };
}

export default function CropImagePage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [turns, setTurns] = useState<QuarterTurns>(0);
  const [rect, setRect] = useState<CropRect>(DEFAULT_RECT);
  const [aspectKey, setAspectKey] = useState("free");
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const run = useToolRun();

  const file = items[0]?.file ?? null;

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.src = url;
    element
      .decode()
      .then(() => {
        if (!cancelled) setImage(element);
      })
      .catch(() => {
        if (!cancelled) setLoadError(errors.corruptFile());
      });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const turned = useMemo(() => (image ? drawTurned(image, turns) : null), [image, turns]);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !turned) return;
    const scale = Math.min(1, PREVIEW_WIDTH / turned.width);
    canvas.width = Math.round(turned.width * scale);
    canvas.height = Math.round(turned.height * scale);
    canvas.getContext("2d")?.drawImage(turned, 0, 0, canvas.width, canvas.height);
  }, [turned]);

  const width = turned?.width ?? 1;
  const height = turned?.height ?? 1;
  const aspect = useMemo(() => {
    const option = ASPECTS.find((entry) => entry.key === aspectKey);
    if (!option || option.ratio === null) return null;
    return option.ratio === -1 ? width / height : option.ratio;
  }, [aspectKey, width, height]);

  const pixels = {
    x: Math.round(rect.x * width),
    y: Math.round(rect.y * height),
    w: Math.max(1, Math.round(rect.w * width)),
    h: Math.max(1, Math.round(rect.h * height)),
  };

  function clearFile() {
    run.reset();
    setItems([]);
    setImage(null);
    setTurns(0);
    setRect(DEFAULT_RECT);
    setAspectKey("free");
    setLoadError(null);
  }

  function turn(change: 1 | -1) {
    setTurns((current) => ((current + change + 4) % 4) as QuarterTurns);
    setRect(DEFAULT_RECT);
  }

  function chooseAspect(key: string) {
    setAspectKey(key);
    const option = ASPECTS.find((entry) => entry.key === key);
    if (!option || option.ratio === null) return;
    const ratio = option.ratio === -1 ? width / height : option.ratio;
    setRect((current) => fitToAspect(current, ratio, width, height));
  }

  /** Number fields: x and y move the box, width and height resize it (holding the shape when one is chosen). */
  function setField(field: "x" | "y" | "w" | "h", value: number) {
    if (!Number.isFinite(value)) return;
    setRect((current) => {
      const next = { ...current };
      if (field === "x") next.x = clamp(value / width, 0, 1 - current.w);
      if (field === "y") next.y = clamp(value / height, 0, 1 - current.h);
      if (field === "w") {
        next.w = clamp(value / width, 1 / width, 1 - current.x);
        if (aspect) next.h = clamp((next.w * width) / aspect / height, 1 / height, 1 - current.y);
      }
      if (field === "h") {
        next.h = clamp(value / height, 1 / height, 1 - current.y);
        if (aspect) next.w = clamp((next.h * height * aspect) / width, 1 / width, 1 - current.x);
      }
      return next;
    });
  }

  async function handleRun() {
    if (!file || !turned) return;
    await run.run(async () => {
      const result = await cropImage(file, turned, rect);
      if (!result.ok) throw result.error;
      return [result.output];
    });
  }

  if (run.status === "success") {
    return (
      <ToolShell tool={tool}>
        <ToolStep title="Result">
          <ResultPanel
            outputs={run.outputs}
            elapsedMs={run.elapsedMs}
            inputSizeBytes={file?.size}
            onReset={clearFile}
          />
        </ToolStep>
      </ToolShell>
    );
  }

  const busy = run.status === "running";

  return (
    <ToolShell tool={tool} error={loadError ?? (run.status === "error" ? run.error : null)}>
      <ToolStep title="Step 1: Image">
        <div className="flex flex-col gap-4">
          <FileDropzone
            accept={tool.accept}
            multiple={false}
            maxFiles={1}
            maxFileSizeMB={tool.maxFileSizeMB}
            currentCount={items.length}
            onAccepted={(files) => {
              run.reset();
              setImage(null);
              setTurns(0);
              setRect(DEFAULT_RECT);
              setAspectKey("free");
              setLoadError(null);
              setItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
            }}
            disabled={busy}
          />
          <FileList items={items} onRemove={clearFile} onClearAll={clearFile} disabled={busy} />
          {file && !image && !loadError && <ProgressBar progress={null} label="Opening image..." />}
        </div>
      </ToolStep>

      {image && turned && (
        <ToolStep title="Step 2: Choose the area to keep">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Shape of the crop">
              {ASPECTS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={aspectKey === option.key}
                  disabled={busy}
                  onClick={() => chooseAspect(option.key)}
                  className={`inline-flex h-11 min-w-11 items-center justify-center rounded-md border px-3 font-mono text-sm transition-[color,background-color,border-color] duration-150 focus-ring ${
                    aspectKey === option.key
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border-strong bg-surface text-foreground hover:border-accent hover:text-accent"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => turn(-1)}>
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Turn left
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => turn(1)}>
                <RotateCw aria-hidden="true" className="h-4 w-4" />
                Turn right
              </Button>
            </div>

            <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-md border border-border bg-muted">
              <canvas ref={previewRef} role="img" aria-label="Preview of the image to crop" className="block h-auto w-full" />
              <CropOverlay
                rect={rect}
                onChange={setRect}
                aspect={aspect}
                naturalWidth={width}
                naturalHeight={height}
                disabled={busy}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Drag the box to move it, drag a corner to resize, or drag outside the box to draw a new one.
              The number fields below do the same with the keyboard.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Input label="Left (px)" type="number" min={0} max={width} value={pixels.x} disabled={busy}
                onChange={(event) => setField("x", Number(event.target.value))} className="font-mono tabular-nums" />
              <Input label="Top (px)" type="number" min={0} max={height} value={pixels.y} disabled={busy}
                onChange={(event) => setField("y", Number(event.target.value))} className="font-mono tabular-nums" />
              <Input label="Width (px)" type="number" min={1} max={width} value={pixels.w} disabled={busy}
                onChange={(event) => setField("w", Number(event.target.value))} className="font-mono tabular-nums" />
              <Input label="Height (px)" type="number" min={1} max={height} value={pixels.h} disabled={busy}
                onChange={(event) => setField("h", Number(event.target.value))} className="font-mono tabular-nums" />
            </div>
            <p className="font-mono text-sm tabular-nums text-muted-foreground">
              Result: {pixels.w} &times; {pixels.h} px, from {width} &times; {height} px
            </p>
          </div>
        </ToolStep>
      )}

      {busy ? (
        <ToolStep title="Cropping">
          <ProgressBar progress={null} label="Cutting the image..." />
        </ToolStep>
      ) : (
        image && (
          <Button type="button" onClick={handleRun} className="self-start">
            Crop image
          </Button>
        )
      )}
    </ToolShell>
  );
}
