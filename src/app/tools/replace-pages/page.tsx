"use client";

import { useEffect, useState } from "react";
import { Replace } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import { replacePages } from "@/lib/pdf/replace-pages";
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

const tool = getToolBySlug("replace-pages")!;

export default function ReplacePagesPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [insertItems, setInsertItems] = useState<FileListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState("");
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const run = useToolRun();

  const file = items[0]?.file ?? null;
  const insertFile = insertItems[0]?.file ?? null;
  const isLoadingThumbnails = !!file && !loadError && (pageCount === null || thumbnails.length < pageCount);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      // Dynamic import (PRD 12.1.4): pdfjs-dist must never be evaluated during SSR.
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
  const canRun = !!file && !!insertFile && !isLoadingThumbnails && selected.size > 0;
  const firstSelected = selected.size > 0 ? Math.min(...selected) : null;

  async function handleRun() {
    if (!file || !insertFile) return;
    await run.run(async () => {
      const result = await replacePages(file, insertFile, [...selected]);
      if (!result.ok) throw result.error;
      return [result.output];
    });
  }

  function handleReset() {
    clearFile();
    setInsertItems([]);
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
      <ToolStep title="Step 1: Original PDF">
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
        <ToolStep title="Step 2: Choose pages to replace">
          <div className="flex flex-col gap-4">
            <Input
              label="Pages to replace"
              placeholder="3"
              value={rangeInput}
              onChange={(e) => handleRangeChange(e.target.value)}
              hint={`This document has ${pageCount} pages. Click a thumbnail to toggle it.`}
              error={rangeError}
            />
            <PageThumbnailGrid
              items={thumbnails.map((dataUrl, i) => ({ key: i + 1, dataUrl }))}
              isSelected={(key) => selected.has(key)}
              onSelect={toggleThumbnail}
              renderBadge={(key) =>
                selected.has(key) ? (
                  <span className="rounded-full bg-danger p-1 text-danger-foreground">
                    <Replace aria-hidden="true" className="h-3 w-3" />
                  </span>
                ) : null
              }
            />
          </div>
        </ToolStep>
      )}

      {file && pageCount && !isLoadingThumbnails && (
        <ToolStep title="Step 3: PDF to insert">
          <div className="flex flex-col gap-4">
            <FileDropzone
              accept={tool.accept}
              multiple={false}
              maxFiles={1}
              maxFileSizeMB={tool.maxFileSizeMB}
              currentCount={insertItems.length}
              onAccepted={(files) => {
                run.reset();
                setInsertItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
              }}
              disabled={run.status === "running"}
            />
            <FileList
              items={insertItems}
              onRemove={() => setInsertItems([])}
              onClearAll={() => setInsertItems([])}
              disabled={run.status === "running"}
            />
            {firstSelected !== null && (
              <p className="text-sm text-muted-foreground">
                {selected.size === 1
                  ? `Page ${firstSelected} is removed and the new PDF takes its place.`
                  : `Pages ${formatPageRange([...selected])} are removed and the new PDF goes where page ${firstSelected} was.`}
              </p>
            )}
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Replacing pages">
          <ProgressBar progress={run.progress} label="Updating PDF..." />
        </ToolStep>
      ) : (
        file && (
          <Button type="button" disabled={!canRun} hint={!file ? "Add the PDF to change first." : !insertFile ? "Add the PDF to insert." : isLoadingThumbnails ? "Loading page previews..." : "Select the pages to replace."} onClick={handleRun} className="self-start">
            Replace pages
          </Button>
        )
      )}
    </ToolShell>
  );
}
