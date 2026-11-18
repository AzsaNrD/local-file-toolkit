"use client";

import { useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import { addWatermark, type WatermarkPosition } from "@/lib/pdf/watermark";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ResultPanel } from "@/components/ResultPanel";
import { ProgressBar } from "@/components/ProgressBar";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";
import { useStoredState, isHexColor, oneOf } from "@/hooks/useStoredState";

const tool = getToolBySlug("watermark-pdf")!;

type Mode = "text" | "image";

const IMAGE_ACCEPT = { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"] };

const POSITION_OPTIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-center", label: "Top center" },
  { value: "top-right", label: "Top right" },
  { value: "center-left", label: "Center left" },
  { value: "center", label: "Center" },
  { value: "center-right", label: "Center right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-right", label: "Bottom right" },
];

export default function WatermarkPdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [mode, setMode] = useStoredState<Mode>("watermark-pdf.mode", "text", oneOf(["text", "image"]));
  const [text, setText] = useStoredState("watermark-pdf.text", "CONFIDENTIAL");
  const [fontSize, setFontSize] = useStoredState("watermark-pdf.size", 48);
  const [color, setColor] = useStoredState("watermark-pdf.color", "#ff0000", isHexColor);
  const [imageItem, setImageItem] = useState<FileListItem | null>(null);
  const [widthPercent, setWidthPercent] = useStoredState("watermark-pdf.width", 25);
  const [opacity, setOpacity] = useStoredState("watermark-pdf.opacity", 0.3);
  const [rotation, setRotation] = useStoredState("watermark-pdf.rotation", 45);
  const [position, setPosition] = useStoredState<WatermarkPosition>("watermark-pdf.position", "center", oneOf(POSITION_OPTIONS.map((option) => option.value)));
  const run = useToolRun();

  const file = items[0]?.file ?? null;
  const canRun = !!file && (mode === "text" ? text.trim().length > 0 : !!imageItem);

  function clearFile() {
    run.reset();
    setItems([]);
  }

  async function handleRun() {
    if (!file) return;
    await run.run(async () => {
      const options =
        mode === "text"
          ? {
              mode: "text" as const,
              text,
              fontSize,
              color,
              opacity,
              rotationDegrees: rotation,
              position,
            }
          : {
              mode: "image" as const,
              imageBytes: await imageItem!.file.arrayBuffer(),
              imageMimeType: imageItem!.file.type,
              widthPercent,
              opacity,
              rotationDegrees: rotation,
              position,
            };
      const result = await addWatermark(file, options);
      if (!result.ok) throw result.error;
      return [result.output];
    });
  }

  function handleReset() {
    clearFile();
    setImageItem(null);
    run.reset();
  }

  if (run.status === "success") {
    return (
      <ToolShell tool={tool}>
        <ToolStep title="Result">
          <ResultPanel
            outputs={run.outputs}
            elapsedMs={run.elapsedMs}
            inputSizeBytes={file?.size}
            onReset={handleReset}
          />
        </ToolStep>
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={tool} error={run.status === "error" ? run.error : null}>
      <ToolStep title="Step 1: File">
        <div className="flex flex-col gap-4">
          <FileDropzone
            accept={tool.accept}
            multiple={false}
            maxFiles={1}
            maxFileSizeMB={tool.maxFileSizeMB}
            currentCount={items.length}
            onAccepted={(files) => {
              if (run.status === "error") run.reset();
              setItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
            }}
            disabled={run.status === "running"}
          />
          <FileList items={items} onRemove={clearFile} onClearAll={clearFile} disabled={run.status === "running"} />
        </div>
      </ToolStep>

      {file && (
        <ToolStep title="Step 2: Watermark">
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Watermark type</legend>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="watermark-mode"
                  checked={mode === "text"}
                  onChange={() => setMode("text")}
                  className="h-4 w-4 accent-accent"
                />
                Text
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="watermark-mode"
                  checked={mode === "image"}
                  onChange={() => setMode("image")}
                  className="h-4 w-4 accent-accent"
                />
                Image
              </label>
            </fieldset>

            {mode === "text" ? (
              <>
                <Input label="Text" value={text} onChange={(e) => setText(e.target.value)} />
                <Slider
                  label="Font size"
                  min={8}
                  max={150}
                  step={1}
                  value={fontSize}
                  onChange={setFontSize}
                  formatValue={(v) => `${v} pt`}
                />
                <label className="flex items-center gap-2 text-sm text-foreground">
                  Color
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-9 w-16 cursor-pointer rounded-md border border-border-strong bg-surface focus-ring"
                  />
                </label>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <FileDropzone
                  accept={IMAGE_ACCEPT}
                  multiple={false}
                  maxFiles={1}
                  maxFileSizeMB={20}
                  currentCount={imageItem ? 1 : 0}
                  onAccepted={(files) =>
                    setImageItem(files[0] ? { id: crypto.randomUUID(), file: files[0] } : null)
                  }
                />
                {imageItem && (
                  <FileList
                    items={[imageItem]}
                    onRemove={() => setImageItem(null)}
                    onClearAll={() => setImageItem(null)}
                  />
                )}
                <Slider
                  label="Size"
                  min={5}
                  max={80}
                  step={1}
                  value={widthPercent}
                  onChange={setWidthPercent}
                  formatValue={(v) => `${v}% of page width`}
                />
              </div>
            )}

            <Select
              label="Position"
              options={POSITION_OPTIONS}
              value={position}
              onChange={(e) => setPosition(e.target.value as WatermarkPosition)}
            />
            <Slider
              label="Opacity"
              min={0.05}
              max={1}
              step={0.05}
              value={opacity}
              onChange={setOpacity}
              formatValue={(v) => `${Math.round(v * 100)}%`}
            />
            <Slider
              label="Rotation"
              min={-180}
              max={180}
              step={5}
              value={rotation}
              onChange={setRotation}
              formatValue={(v) => `${v} deg`}
            />
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Applying watermark">
          <ProgressBar progress={null} label="Adding watermark..." />
        </ToolStep>
      ) : (
        file && (
          <Button type="button" disabled={!canRun} hint={!file ? "Add a PDF first." : mode === "text" ? "Type the watermark text." : "Choose the logo image."} onClick={handleRun} className="self-start">
            Add watermark
          </Button>
        )
      )}
    </ToolShell>
  );
}
