"use client";

import { useEffect, useState } from "react";
import { RotateCcw, RotateCw } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import { rotatePages } from "@/lib/pdf/rotate";
import { errors, type AppError } from "@/lib/errors";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { PageThumbnailGrid } from "@/components/PageThumbnailGrid";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";

const tool = getToolBySlug("rotate-pdf")!;

export default function RotatePdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [deltas, setDeltas] = useState<Record<number, number>>({});
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const run = useToolRun();

  const file = items[0]?.file ?? null;
  const isLoadingThumbnails = !!file && !loadError && (pageCount === null || thumbnails.length < pageCount);
  const hasChanges = Object.values(deltas).some((delta) => delta % 360 !== 0);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      // Dynamic import, not a top-level one (PRD 12.1.4): pdfjs-dist must
      // never be evaluated during SSR, only lazily in the browser.
      const { loadPdfForThumbnails, renderAllThumbnails } = await import("@/lib/pdf/thumbnails");
      const bytes = await file.arrayBuffer();
      const pdf = await loadPdfForThumbnails(bytes);
      if (cancelled) return;
      setPageCount(pdf.numPages);
      const rendered = await renderAllThumbnails(pdf);
      if (!cancelled) setThumbnails(rendered);
    })().catch((thrown) => {
      if (cancelled) return;
      setLoadError(
        thrown && thrown.name === "PasswordException" ? errors.encryptedPdf() : errors.corruptFile(),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  function clearFile() {
    run.reset();
    setItems([]);
    setThumbnails([]);
    setPageCount(null);
    setDeltas({});
    setLoadError(null);
  }

  function rotateOne(pageNumber: number, change: number) {
    setDeltas((current) => ({ ...current, [pageNumber]: (current[pageNumber] ?? 0) + change }));
  }

  function rotateAll(change: number) {
    if (!pageCount) return;
    setDeltas((current) => {
      const next = { ...current };
      for (let page = 1; page <= pageCount; page++) next[page] = (next[page] ?? 0) + change;
      return next;
    });
  }

  async function handleRun() {
    if (!file) return;
    await run.run(async () => {
      const result = await rotatePages(file, deltas);
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
              setThumbnails([]);
              setPageCount(null);
              setDeltas({});
              setLoadError(null);
              setItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
            }}
            disabled={run.status === "running"}
          />
          <FileList items={items} onRemove={clearFile} onClearAll={clearFile} disabled={run.status === "running"} />
          {isLoadingThumbnails && <ProgressBar progress={null} label="Rendering page previews..." />}
        </div>
      </ToolStep>

      {file && pageCount && !isLoadingThumbnails && (
        <ToolStep title="Step 2: Rotate pages">
          <div className="flex flex-col gap-4">
            <div className="flex gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => rotateAll(-90)}>
                <RotateCcw aria-hidden="true" className="h-4 w-4" />
                Rotate all left
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => rotateAll(90)}>
                <RotateCw aria-hidden="true" className="h-4 w-4" />
                Rotate all right
              </Button>
            </div>
            <PageThumbnailGrid
              items={thumbnails.map((dataUrl, i) => ({ key: i + 1, dataUrl }))}
              rotation={(key) => deltas[key] ?? 0}
              renderActions={(key) => (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Rotate page ${key} left`}
                    onClick={() => rotateOne(key, -90)}
                    className="w-11 px-0"
                  >
                    <RotateCcw aria-hidden="true" className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Rotate page ${key} right`}
                    onClick={() => rotateOne(key, 90)}
                    className="w-11 px-0"
                  >
                    <RotateCw aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </>
              )}
            />
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Rotating">
          <ProgressBar progress={run.progress} label="Applying rotation..." />
        </ToolStep>
      ) : (
        file && (
          <Button type="button" disabled={!hasChanges} hint="Rotate a page first." onClick={handleRun} className="self-start">
            Save rotated PDF
          </Button>
        )
      )}
    </ToolShell>
  );
}
