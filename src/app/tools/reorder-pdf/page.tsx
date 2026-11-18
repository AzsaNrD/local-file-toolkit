"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import { reorderPages } from "@/lib/pdf/reorder";
import { errors, type AppError } from "@/lib/errors";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { PageThumbnailGrid } from "@/components/PageThumbnailGrid";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";

const tool = getToolBySlug("reorder-pdf")!;

export default function ReorderPdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [order, setOrder] = useState<number[]>([]);
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const run = useToolRun();

  const file = items[0]?.file ?? null;
  const isLoadingThumbnails = !!file && !loadError && (pageCount === null || thumbnails.length < pageCount);
  const isOriginalOrder = order.every((pageNumber, index) => pageNumber === index + 1);

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
      setOrder(Array.from({ length: pdf.numPages }, (_, i) => i + 1));
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
    setOrder([]);
    setLoadError(null);
  }

  async function handleRun() {
    if (!file) return;
    await run.run(async () => {
      const result = await reorderPages(file, order);
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
              setOrder([]);
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
        <ToolStep title="Step 2: Drag pages into a new order">
          <div className="flex flex-col gap-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setOrder((current) => [...current].reverse())}
              className="self-start"
            >
              <ArrowLeftRight aria-hidden="true" className="h-4 w-4" />
              Reverse order
            </Button>
            <PageThumbnailGrid
              items={order.map((pageNumber) => ({ key: pageNumber, dataUrl: thumbnails[pageNumber - 1] }))}
              reorderable
              onReorder={setOrder}
            />
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Reordering">
          <ProgressBar progress={run.progress} label="Rebuilding PDF..." />
        </ToolStep>
      ) : (
        file && (
          <Button type="button" disabled={isOriginalOrder} hint="Drag a page to a new spot first." onClick={handleRun} className="self-start">
            Save reordered PDF
          </Button>
        )
      )}
    </ToolShell>
  );
}
