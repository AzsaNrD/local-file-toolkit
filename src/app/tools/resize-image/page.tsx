"use client";

import { useEffect, useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import { resizeImage, type ResizeMode } from "@/lib/image/resize";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Input } from "@/components/ui/Input";
import { Slider } from "@/components/ui/Slider";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";
import { useStoredState, oneOf } from "@/hooks/useStoredState";
import { useThumbnailUrls } from "@/hooks/useThumbnailUrls";
import type { OutputFile } from "@/lib/types";

const tool = getToolBySlug("resize-image")!;

interface Dimensions {
  width: number;
  height: number;
}

export default function ResizeImagePage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const thumbnailUrls = useThumbnailUrls(items);
  const [dimensions, setDimensions] = useState<Record<string, Dimensions>>({});
  const [mode, setMode] = useStoredState<ResizeMode>("resize-image.mode", "dimensions", oneOf(["dimensions", "percentage", "fit"]));
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const [lockAspectRatio, setLockAspectRatio] = useStoredState("resize-image.lock", true);
  const [percentage, setPercentage] = useStoredState("resize-image.percent", 100);
  const [maxWidth, setMaxWidth] = useStoredState("resize-image.maxw", 1000);
  const [maxHeight, setMaxHeight] = useStoredState("resize-image.maxh", 1000);
  const run = useToolRun();

  useEffect(() => {
    for (const item of items) {
      const url = thumbnailUrls[item.id];
      if (!url || dimensions[item.id]) continue;
      const img = new Image();
      img.onload = () => {
        setDimensions((current) => ({
          ...current,
          [item.id]: { width: img.naturalWidth, height: img.naturalHeight },
        }));
      };
      img.src = url;
    }
  }, [items, dimensions, thumbnailUrls]);

  function handleAccepted(files: File[]) {
    if (run.status === "error") run.reset();
    setItems((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  function handleRemove(id: string) {
    if (run.status === "error") run.reset();
    setItems((current) => current.filter((item) => item.id !== id));
    setDimensions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  const itemsWithMeta = items.map((item) => ({
    ...item,
    meta: dimensions[item.id] ? `${dimensions[item.id].width}x${dimensions[item.id].height}` : undefined,
    thumbnailUrl: thumbnailUrls[item.id],
  }));

  const firstDimensions = items[0] ? dimensions[items[0].id] : undefined;
  const previewHeight =
    mode === "dimensions" && lockAspectRatio && firstDimensions
      ? Math.max(1, Math.round(width * (firstDimensions.height / firstDimensions.width)))
      : undefined;

  const inputSizeBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  async function handleRun() {
    await run.run(async (setProgress) => {
      const outputs: OutputFile[] = [];
      for (let i = 0; i < items.length; i++) {
        const file = items[i].file;
        const original = dimensions[items[i].id];
        const result = await resizeImage(file, {
          mode,
          width:
            mode === "dimensions"
              ? width
              : undefined,
          height:
            mode === "dimensions"
              ? lockAspectRatio && original
                ? Math.max(1, Math.round(width * (original.height / original.width)))
                : height
              : undefined,
          percentage: mode === "percentage" ? percentage : undefined,
          maxWidth: mode === "fit" ? maxWidth : undefined,
          maxHeight: mode === "fit" ? maxHeight : undefined,
        });
        if (!result.ok) throw result.error;
        outputs.push(result.output);
        setProgress(((i + 1) / items.length) * 100);
      }
      return outputs;
    });
  }

  function handleReset() {
    setItems([]);
    setDimensions({});
    run.reset();
  }

  if (run.status === "success") {
    return (
      <ToolShell tool={tool}>
        <ToolStep title="Result">
          <ResultPanel
            outputs={run.outputs}
            elapsedMs={run.elapsedMs}
            inputSizeBytes={inputSizeBytes}
            zipFilename="resized-images.zip"
            onReset={handleReset}
          />
        </ToolStep>
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={tool} error={run.status === "error" ? run.error : null}>
      <ToolStep title="Step 1: Files">
        <div className="flex flex-col gap-4">
          <FileDropzone
            accept={tool.accept}
            multiple={tool.multiple}
            maxFiles={tool.maxFiles}
            maxFileSizeMB={tool.maxFileSizeMB}
            currentCount={items.length}
            onAccepted={handleAccepted}
            disabled={run.status === "running"}
          />
          <FileList
            items={itemsWithMeta}
            onRemove={handleRemove}
            onClearAll={() => {
              setItems([]);
              setDimensions({});
            }}
            disabled={run.status === "running"}
          />
        </div>
      </ToolStep>

      {items.length > 0 && (
        <ToolStep title="Step 2: Options">
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Resize mode</legend>
              {(
                [
                  ["dimensions", "By dimensions"],
                  ["percentage", "By percentage"],
                  ["fit", "Fit inside a box"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="resize-mode"
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="h-4 w-4 accent-accent"
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            {mode === "dimensions" && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Input
                    label="Width"
                    type="number"
                    min={1}
                    value={width}
                    onChange={(e) => setWidth(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <Input
                    label="Height"
                    type="number"
                    min={1}
                    value={lockAspectRatio ? (previewHeight ?? "") : height}
                    disabled={lockAspectRatio}
                    placeholder={lockAspectRatio ? "auto" : undefined}
                    onChange={(e) => setHeight(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={lockAspectRatio}
                    onChange={(e) => setLockAspectRatio(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  Lock aspect ratio
                </label>
              </div>
            )}

            {mode === "percentage" && (
              <Slider
                label="Scale"
                min={10}
                max={200}
                step={1}
                value={percentage}
                onChange={setPercentage}
                formatValue={(v) => `${v}%`}
              />
            )}

            {mode === "fit" && (
              <div className="flex gap-3">
                <Input
                  label="Max width"
                  type="number"
                  min={1}
                  value={maxWidth}
                  onChange={(e) => setMaxWidth(Math.max(1, Number(e.target.value) || 1))}
                />
                <Input
                  label="Max height"
                  type="number"
                  min={1}
                  value={maxHeight}
                  onChange={(e) => setMaxHeight(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
            )}
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Resizing">
          <ProgressBar progress={run.progress} label="Resizing images..." />
        </ToolStep>
      ) : (
        items.length > 0 && (
          <Button type="button" onClick={handleRun} className="self-start">
            Resize {items.length} image{items.length === 1 ? "" : "s"}
          </Button>
        )
      )}
    </ToolShell>
  );
}
