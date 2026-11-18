"use client";

import { useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import { addPageNumbers } from "@/lib/pdf/page-numbers";
import type { PageAnchorPosition } from "@/lib/pdf/layout";
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

const tool = getToolBySlug("page-numbers")!;

const POSITION_OPTIONS: { value: PageAnchorPosition; label: string }[] = [
  { value: "bottom-center", label: "Bottom center" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "top-center", label: "Top center" },
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
];

export default function PageNumbersPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [position, setPosition] = useStoredState<PageAnchorPosition>("page-numbers.position", "bottom-center", oneOf(POSITION_OPTIONS.map((option) => option.value)));
  const [format, setFormat] = useStoredState("page-numbers.format", "{n}");
  const [fontSize, setFontSize] = useStoredState("page-numbers.size", 12);
  const [color, setColor] = useStoredState("page-numbers.color", "#000000", isHexColor);
  const [startAt, setStartAt] = useStoredState("page-numbers.start", 1);
  const [skipFirstPage, setSkipFirstPage] = useStoredState("page-numbers.skip", false);
  const run = useToolRun();

  const file = items[0]?.file ?? null;
  const canRun = !!file && format.includes("{n}");

  function clearFile() {
    run.reset();
    setItems([]);
  }

  async function handleRun() {
    if (!file) return;
    await run.run(async () => {
      const result = await addPageNumbers(file, {
        position,
        format,
        fontSize,
        color,
        startAt,
        skipFirstPage,
      });
      if (!result.ok) throw result.error;
      return [result.output];
    });
  }

  function handleReset() {
    clearFile();
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
        <ToolStep title="Step 2: Numbering">
          <div className="flex flex-col gap-4">
            <Input
              label="Format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              hint='Use {n} for the page number and {total} for the page count, e.g. "Page {n} of {total}".'
              error={!format.includes("{n}") ? "The format needs a {n} placeholder." : undefined}
            />
            <Select
              label="Position"
              options={POSITION_OPTIONS}
              value={position}
              onChange={(e) => setPosition(e.target.value as PageAnchorPosition)}
            />
            <Slider
              label="Font size"
              min={6}
              max={36}
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
            <Input
              label="Start numbering at"
              type="number"
              min={0}
              value={startAt}
              onChange={(e) => setStartAt(Math.max(0, Number(e.target.value) || 0))}
            />
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={skipFirstPage}
                onChange={(e) => setSkipFirstPage(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Skip the first page (useful for a cover page)
            </label>
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Numbering pages">
          <ProgressBar progress={null} label="Adding page numbers..." />
        </ToolStep>
      ) : (
        file && (
          <Button type="button" disabled={!canRun} hint={!file ? "Add a PDF first." : "The format needs {n} where the number goes."} onClick={handleRun} className="self-start">
            Add page numbers
          </Button>
        )
      )}
    </ToolShell>
  );
}
