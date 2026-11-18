"use client";

import { useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import { imagesToPdf, type Orientation, type PageSizeMode } from "@/lib/pdf/from-images";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";
import { useStoredState, oneOf } from "@/hooks/useStoredState";
import { useThumbnailUrls } from "@/hooks/useThumbnailUrls";

const tool = getToolBySlug("image-to-pdf")!;

export default function ImageToPdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const thumbnailUrls = useThumbnailUrls(items);
  const [pageSize, setPageSize] = useStoredState<PageSizeMode>("image-to-pdf.size", "fit", oneOf(["fit", "a4", "letter"]));
  const [orientation, setOrientation] = useStoredState<Orientation>("image-to-pdf.orientation", "auto", oneOf(["portrait", "landscape", "auto"]));
  const [marginMM, setMarginMM] = useStoredState("image-to-pdf.margin", 0);
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
      const result = await imagesToPdf(
        items.map((item) => item.file),
        { pageSize, orientation, marginMM },
        (done, total) => setProgress((done / total) * 100),
      );
      if (!result.ok) throw result.error;
      return [result.output];
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
            onReset={handleReset}
          />
        </ToolStep>
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={tool} error={run.status === "error" ? run.error : null}>
      <ToolStep title="Step 1: Images">
        <div className="flex flex-col gap-4">
          <FileDropzone
            accept={tool.accept}
            multiple={tool.multiple}
            maxFiles={tool.maxFiles}
            maxFileSizeMB={tool.maxFileSizeMB}
            currentCount={items.length}
            onAccepted={handleAccepted}
            disabled={run.status === "running"}
            unsupportedTypeHint="WebP and HEIC aren't supported here; convert them to JPEG or PNG first with the Convert image format tool."
          />
          <FileList
            items={items.map((item) => ({ ...item, thumbnailUrl: thumbnailUrls[item.id] }))}
            onRemove={handleRemove}
            onClearAll={() => {
              run.reset();
              setItems([]);
            }}
            reorderable
            onReorder={setItems}
            disabled={run.status === "running"}
          />
        </div>
      </ToolStep>

      {items.length > 0 && (
        <ToolStep title="Step 2: Options">
          <div className="flex flex-col gap-4">
            <Select
              label="Page size"
              options={[
                { value: "fit", label: "Fit to image" },
                { value: "a4", label: "A4" },
                { value: "letter", label: "Letter" },
              ]}
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as PageSizeMode)}
            />

            {pageSize !== "fit" && (
              <>
                <Select
                  label="Orientation"
                  options={[
                    { value: "portrait", label: "Portrait" },
                    { value: "landscape", label: "Landscape" },
                    { value: "auto", label: "Auto" },
                  ]}
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as Orientation)}
                />
                <Input
                  label="Margin (mm)"
                  type="number"
                  min={0}
                  max={50}
                  value={marginMM}
                  onChange={(e) =>
                    setMarginMM(Math.min(50, Math.max(0, Number(e.target.value) || 0)))
                  }
                />
              </>
            )}
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Building PDF">
          <ProgressBar progress={run.progress} label="Adding images..." />
        </ToolStep>
      ) : (
        items.length > 0 && (
          <Button type="button" onClick={handleRun} className="self-start">
            Create PDF from {items.length} image{items.length === 1 ? "" : "s"}
          </Button>
        )
      )}
    </ToolShell>
  );
}
