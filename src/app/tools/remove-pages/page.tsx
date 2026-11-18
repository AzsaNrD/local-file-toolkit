"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import { removePages } from "@/lib/pdf/remove-pages";
import { parsePageRange, formatPageRange } from "@/lib/parse-page-range";
import { errors, type AppError } from "@/lib/errors";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { PageThumbnailGrid } from "@/components/PageThumbnailGrid";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";

const tool = getToolBySlug("remove-pages")!;

export default function RemovePagesPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState("");
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const run = useToolRun();

  const file = items[0]?.file ?? null;
  const isLoadingThumbnails = !!file && !loadError && (pageCount === null || thumbnails.length < pageCount);

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
    setSelected(new Set());
    setRangeInput("");
    setLoadError(null);
  }

  function toggleThumbnail(pageNumber: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(pageNumber)) next.delete(pageNumber);
      else next.add(pageNumber);
      setRangeInput(formatPageRange([...next]));
      return next;
    });
  }

  function handleRangeChange(value: string) {
    setRangeInput(value);
    if (!pageCount) return;
    const result = parsePageRange(value, pageCount);
    if (result.ok) setSelected(new Set(result.pages));
  }

  const rangeResult = pageCount ? parsePageRange(rangeInput, pageCount) : null;
  const rangeError = rangeInput.length > 0 && rangeResult && !rangeResult.ok ? rangeResult.error.message : undefined;
  const willRemoveEverything = pageCount !== null && selected.size >= pageCount && pageCount > 0;
  const canRun = !!file && !isLoadingThumbnails && selected.size > 0 && !willRemoveEverything;

  async function handleRun() {
    if (!file) return;
    await run.run(async () => {
      const result = await removePages(file, [...selected]);
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
              setSelected(new Set());
              setRangeInput("");
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
        <ToolStep title="Step 2: Choose pages to delete">
          <div className="flex flex-col gap-4">
            <Input
              label="Pages to delete"
              placeholder="1-3,7,9-11"
              value={rangeInput}
              onChange={(e) => handleRangeChange(e.target.value)}
              hint={`This document has ${pageCount} pages. Click a thumbnail to toggle it.`}
              error={rangeError}
            />
            {willRemoveEverything && (
              <p className="text-sm text-danger">
                Select fewer pages: at least one page must remain in the document.
              </p>
            )}
            <PageThumbnailGrid
              items={thumbnails.map((dataUrl, i) => ({ key: i + 1, dataUrl }))}
              isSelected={(key) => selected.has(key)}
              onSelect={toggleThumbnail}
              renderBadge={(key) =>
                selected.has(key) ? (
                  <span className="rounded-full bg-danger p-1 text-danger-foreground">
                    <Trash2 aria-hidden="true" className="h-3 w-3" />
                  </span>
                ) : null
              }
            />
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Removing pages">
          <ProgressBar progress={run.progress} label="Updating PDF..." />
        </ToolStep>
      ) : (
        file && (
          <Button type="button" disabled={!canRun} hint={!file ? "Add a PDF first." : isLoadingThumbnails ? "Loading page previews..." : willRemoveEverything ? "At least one page has to stay." : "Select the pages to delete."} onClick={handleRun} className="self-start">
            {selected.size > 0 ? `Delete ${selected.size} page${selected.size === 1 ? "" : "s"}` : "Delete pages"}
          </Button>
        )
      )}
    </ToolShell>
  );
}
