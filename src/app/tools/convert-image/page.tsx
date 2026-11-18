"use client";

import { useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import { convertImage, type ImageFormat } from "@/lib/image/convert";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";
import { useStoredState, isHexColor, oneOf } from "@/hooks/useStoredState";
import { useThumbnailUrls } from "@/hooks/useThumbnailUrls";
import type { OutputFile } from "@/lib/types";

const tool = getToolBySlug("convert-image")!;

const FORMAT_OPTIONS: { value: ImageFormat; label: string }[] = [
  { value: "image/jpeg", label: "JPEG" },
  { value: "image/png", label: "PNG" },
  { value: "image/webp", label: "WebP" },
];

export default function ConvertImagePage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const thumbnailUrls = useThumbnailUrls(items);
  const [targetFormat, setTargetFormat] = useStoredState<ImageFormat>("convert-image.format", "image/png", oneOf(FORMAT_OPTIONS.map((option) => option.value)));
  const [quality, setQuality] = useStoredState("convert-image.quality", 0.85);
  const [backgroundColor, setBackgroundColor] = useStoredState("convert-image.background", "#ffffff", isHexColor);
  const run = useToolRun();

  function handleAccepted(files: File[]) {
    if (run.status === "error") run.reset();
    setItems((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  function handleRemove(id: string) {
    if (run.status === "error") run.reset();
    setItems((current) => current.filter((item) => item.id !== id));
  }

  const allSameAsTarget = items.length > 0 && items.every((item) => item.file.type === targetFormat);
  const inputSizeBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  async function handleRun() {
    await run.run(async (setProgress) => {
      const outputs: OutputFile[] = [];
      for (let i = 0; i < items.length; i++) {
        const result = await convertImage(items[i].file, {
          targetFormat,
          quality: targetFormat === "image/png" ? undefined : quality,
          backgroundColor,
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
            zipFilename="converted-images.zip"
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
            <Select
              label="Convert to"
              options={FORMAT_OPTIONS}
              value={targetFormat}
              onChange={(e) => setTargetFormat(e.target.value as ImageFormat)}
            />

            {targetFormat !== "image/png" && (
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

            {targetFormat === "image/jpeg" && (
              <label className="flex items-center gap-2 text-sm text-foreground">
                Background colour for transparent areas
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="h-9 w-16 cursor-pointer rounded-md border border-border-strong bg-surface focus-ring"
                />
              </label>
            )}

            {allSameAsTarget && (
              <p className="text-sm text-danger">
                All selected files are already {FORMAT_OPTIONS.find((f) => f.value === targetFormat)?.label}.
                Choose a different target format.
              </p>
            )}
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Converting">
          <ProgressBar progress={run.progress} label="Converting images..." />
        </ToolStep>
      ) : (
        items.length > 0 && (
          <Button type="button" disabled={allSameAsTarget} hint="Every file is already in this format. Pick another one." onClick={handleRun} className="self-start">
            Convert {items.length} image{items.length === 1 ? "" : "s"}
          </Button>
        )
      )}
    </ToolShell>
  );
}
