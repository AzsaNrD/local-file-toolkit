"use client";

import { useState } from "react";
import { toast } from "sonner";
import { getToolBySlug } from "@/lib/tools";
import { compressImage, type CompressMode } from "@/lib/image/compress";
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

const tool = getToolBySlug("compress-image")!;

export default function CompressImagePage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const thumbnailUrls = useThumbnailUrls(items);
  const [mode, setMode] = useStoredState<CompressMode>("compress-image.mode", "target-size", oneOf(["target-size", "quality"]));
  const [targetSizeMB, setTargetSizeMB] = useStoredState("compress-image.target", 1);
  const [quality, setQuality] = useStoredState("compress-image.quality", 0.8);
  const [limitLongestSide, setLimitLongestSide] = useStoredState("compress-image.limit", false);
  const [maxWidthOrHeight, setMaxWidthOrHeight] = useStoredState("compress-image.longest", 2000);
  const run = useToolRun();

  function handleAccepted(files: File[]) {
    if (run.status === "error") run.reset();
    setItems((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  function handleRemove(id: string) {
    if (run.status === "error") run.reset();
    setItems((current) => current.filter((item) => item.id !== id));
  }

  const inputSizeBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  async function handleRun() {
    await run.run(async (setProgress) => {
      const outputs: OutputFile[] = [];
      let skippedCount = 0;
      for (let i = 0; i < items.length; i++) {
        const result = await compressImage(
          items[i].file,
          {
            mode,
            targetSizeMB: mode === "target-size" ? targetSizeMB : undefined,
            quality: mode === "quality" ? quality : undefined,
            maxWidthOrHeight: limitLongestSide ? maxWidthOrHeight : undefined,
          },
          (fileProgress) => setProgress(((i + fileProgress / 100) / items.length) * 100),
        );
        if (!result.ok) throw result.error;
        if (result.result.skipped) skippedCount++;
        outputs.push(result.result.output);
      }
      if (skippedCount > 0) {
        toast.info(
          skippedCount === 1
            ? "One file was already smaller than the target, so it was returned unchanged."
            : `${skippedCount} files were already smaller than the target, so they were returned unchanged.`,
        );
      }
      return outputs;
    });
  }

  function handleReset() {
    setItems([]);
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
            zipFilename="compressed-images.zip"
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
            items={items.map((item) => ({ ...item, thumbnailUrl: thumbnailUrls[item.id] }))}
            onRemove={handleRemove}
            onClearAll={() => {
              run.reset();
              setItems([]);
            }}
            disabled={run.status === "running"}
          />
        </div>
      </ToolStep>

      {items.length > 0 && (
        <ToolStep title="Step 2: Options">
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Compression mode</legend>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="compress-mode"
                  checked={mode === "target-size"}
                  onChange={() => setMode("target-size")}
                  className="h-4 w-4 accent-accent"
                />
                Target size
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="compress-mode"
                  checked={mode === "quality"}
                  onChange={() => setMode("quality")}
                  className="h-4 w-4 accent-accent"
                />
                Quality
              </label>
            </fieldset>

            {mode === "target-size" ? (
              <Input
                label="Target size (MB)"
                type="number"
                min={0.1}
                step={0.1}
                value={targetSizeMB}
                onChange={(e) => setTargetSizeMB(Math.max(0.1, Number(e.target.value) || 1))}
              />
            ) : (
              <Slider
                label="Quality"
                min={0.1}
                max={1}
                step={0.05}
                value={quality}
                onChange={setQuality}
                formatValue={(v) => v.toFixed(2)}
              />
            )}

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={limitLongestSide}
                onChange={(e) => setLimitLongestSide(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Also limit longest side to
              <input
                type="number"
                min={1}
                value={maxWidthOrHeight}
                disabled={!limitLongestSide}
                onChange={(e) => setMaxWidthOrHeight(Math.max(1, Number(e.target.value) || 1))}
                className="h-9 w-24 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm focus-ring focus-visible:border-accent disabled:opacity-50"
              />
              pixels
            </label>
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Compressing">
          <ProgressBar progress={run.progress} label="Compressing images..." />
        </ToolStep>
      ) : (
        items.length > 0 && (
          <Button type="button" onClick={handleRun} className="self-start">
            Compress {items.length} image{items.length === 1 ? "" : "s"}
          </Button>
        )
      )}
    </ToolShell>
  );
}
