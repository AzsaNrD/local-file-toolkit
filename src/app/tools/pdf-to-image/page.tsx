"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getToolBySlug } from "@/lib/tools";
import { loadPdf } from "@/lib/pdf/load";
import { errors, type AppError } from "@/lib/errors";
import type { ImageOutputFormat, Resolution } from "@/lib/pdf/to-image";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";
import { useStoredState, oneOf } from "@/hooks/useStoredState";

const tool = getToolBySlug("pdf-to-image")!;

const RESOLUTION_OPTIONS: { value: Resolution; label: string }[] = [
  { value: "low", label: "Low (72 DPI)" },
  { value: "medium", label: "Medium (150 DPI)" },
  { value: "high", label: "High (300 DPI)" },
];

export default function PdfToImagePage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [format, setFormat] = useStoredState<ImageOutputFormat>("pdf-to-image.format", "png", oneOf(["png", "jpeg"]));
  const [quality, setQuality] = useStoredState("pdf-to-image.quality", 0.85);
  const [resolution, setResolution] = useStoredState<Resolution>("pdf-to-image.resolution", "medium", oneOf(["low", "medium", "high"]));
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const run = useToolRun();

  const file = items[0]?.file ?? null;
  const isLoadingPageCount = !!file && !loadError && pageCount === null;

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      const bytes = await file.arrayBuffer();
      const result = await loadPdf(bytes);
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      // A "recovered" document from a badly malformed file can still throw
      // here (e.g. a missing page tree), so this needs its own guard rather
      // than trusting loadPdf's ok:true to mean "safe to read".
      setPageCount(result.doc.getPageCount());
    })().catch(() => {
      if (!cancelled) setLoadError(errors.corruptFile());
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  function clearFile() {
    run.reset();
    setItems([]);
    setPageCount(null);
    setLoadError(null);
  }

  async function handleRun() {
    if (!file) return;
    if (pageCount && pageCount > 30 && resolution === "high") {
      toast.warning(`Rendering ${pageCount} pages at 300 DPI can take a while and use a lot of memory.`);
    }
    await run.run(async (setProgress) => {
      const { pdfToImages } = await import("@/lib/pdf/to-image");
      const result = await pdfToImages(
        file,
        { format, quality, resolution },
        (done, total) => setProgress((done / total) * 100),
      );
      if (!result.ok) throw result.error;
      return result.outputs;
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
            zipFilename={`${file?.name.replace(/\.pdf$/i, "") ?? "pages"}.zip`}
            onReset={handleReset}
          />
        </ToolStep>
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={tool} error={loadError ?? (run.status === "error" ? run.error : null)}>
      <ToolStep title="Step 1: File">
        <div className="flex flex-col gap-4">
          <FileDropzone
            accept={tool.accept}
            multiple={false}
            maxFiles={1}
            maxFileSizeMB={tool.maxFileSizeMB}
            currentCount={items.length}
            onAccepted={(files) => {
              run.reset();
              setPageCount(null);
              setLoadError(null);
              setItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
            }}
            disabled={run.status === "running"}
          />
          <FileList
            items={items.map((item) => ({
              ...item,
              meta: pageCount ? `${pageCount} pages` : undefined,
            }))}
            onRemove={clearFile}
            onClearAll={clearFile}
            disabled={run.status === "running"}
          />
          {isLoadingPageCount && <ProgressBar progress={null} label="Reading PDF..." />}
        </div>
      </ToolStep>

      {file && pageCount && (
        <ToolStep title="Step 2: Options">
          <div className="flex flex-col gap-4">
            <Select
              label="Format"
              options={[
                { value: "png", label: "PNG" },
                { value: "jpeg", label: "JPEG" },
              ]}
              value={format}
              onChange={(e) => setFormat(e.target.value as ImageOutputFormat)}
            />
            {format === "jpeg" && (
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
            <Select
              label="Resolution"
              options={RESOLUTION_OPTIONS}
              value={resolution}
              onChange={(e) => setResolution(e.target.value as Resolution)}
            />
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Rendering">
          <ProgressBar progress={run.progress} label="Rendering pages..." />
        </ToolStep>
      ) : (
        file &&
        pageCount && (
          <Button type="button" onClick={handleRun} className="self-start">
            Render {pageCount} page{pageCount === 1 ? "" : "s"}
          </Button>
        )
      )}
    </ToolShell>
  );
}
