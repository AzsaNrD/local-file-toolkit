"use client";

import { useEffect, useRef, useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import { splitPdf, type SplitMode } from "@/lib/pdf/split";
import { parsePageRange, parsePageRangeGroups } from "@/lib/parse-page-range";
import { errors, type AppError } from "@/lib/errors";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { PageThumbnailGrid } from "@/components/PageThumbnailGrid";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Lightbox } from "@/components/Lightbox";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";

const tool = getToolBySlug("split-pdf")!;

const MODES: { value: SplitMode; label: string }[] = [
  { value: "range", label: "By range" },
  { value: "single-pages", label: "Into single pages" },
  { value: "every-n", label: "Every N pages" },
];

export default function SplitPdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const [mode, setMode] = useState<SplitMode>("range");
  const [rangeInput, setRangeInput] = useState("");
  const [separateRangeFiles, setSeparateRangeFiles] = useState(false);
  const [everyN, setEveryN] = useState(1);
  const [zoomPage, setZoomPage] = useState<number | null>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const latestZoomPageRef = useRef<number | null>(null);
  const run = useToolRun();

  const file = items[0]?.file ?? null;

  function clearFile() {
    run.reset();
    setItems([]);
    setThumbnails([]);
    setPageCount(null);
    setLoadError(null);
    setZoomPage(null);
    setZoomSrc(null);
  }

  // Shows the already-rendered small thumbnail immediately, then swaps in a
  // sharper render of just that page. Re-rendering only on demand avoids
  // paying for a large render of every page up front.
  function handleThumbnailZoom(pageNumber: number) {
    latestZoomPageRef.current = pageNumber;
    setZoomPage(pageNumber);
    setZoomSrc(thumbnails[pageNumber - 1] ?? null);
    if (!file) return;
    (async () => {
      const { loadPdfForThumbnails, renderThumbnail } = await import("@/lib/pdf/thumbnails");
      const bytes = await file.arrayBuffer();
      const pdf = await loadPdfForThumbnails(bytes);
      const dataUrl = await renderThumbnail(pdf, pageNumber, 900);
      if (latestZoomPageRef.current === pageNumber) setZoomSrc(dataUrl);
    })().catch(() => {
      // Keep the already-shown low-res thumbnail if the sharper render fails.
    });
  }

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
      // A stuck spinner with no way forward is worse than a wrong error
      // code: PasswordException is pdf.js's own name for "needs a password".
      setLoadError(
        thrown && thrown.name === "PasswordException" ? errors.encryptedPdf() : errors.corruptFile(),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Derived, not a separate state slice: avoids a synchronous setState at
  // the top of the effect above (the new react-hooks/set-state-in-effect
  // rule flags that), and stays correct without a manual reset anywhere.
  // Stops as soon as loadError is set, so a bad file doesn't spin forever.
  const isLoadingThumbnails =
    !!file && !loadError && (pageCount === null || thumbnails.length < pageCount);

  const rangeResult = pageCount ? parsePageRange(rangeInput, pageCount) : null;
  const rangeGroupsResult =
    mode === "range" && separateRangeFiles && pageCount
      ? parsePageRangeGroups(rangeInput, pageCount)
      : null;
  const everyNFileCount = pageCount ? Math.ceil(pageCount / Math.max(1, everyN)) : null;
  const canRun =
    !!file &&
    !isLoadingThumbnails &&
    (mode === "single-pages" ||
      (mode === "range" && rangeResult?.ok) ||
      (mode === "every-n" && everyN >= 1));

  async function handleSplit() {
    if (!file || !pageCount) return;
    await run.run(async (setProgress) => {
      let options: Parameters<typeof splitPdf>[1];
      if (mode === "range") {
        if (separateRangeFiles) {
          const groupsResult = parsePageRangeGroups(rangeInput, pageCount);
          if (!groupsResult.ok) throw groupsResult.error;
          options = { mode, rangeGroups: groupsResult.groups };
        } else {
          options = {
            mode,
            range: rangeResult && rangeResult.ok ? rangeResult.pages : [],
            rangeLabel: rangeInput.replace(/\s+/g, ""),
          };
        }
      } else if (mode === "every-n") {
        options = { mode, everyN };
      } else {
        options = { mode };
      }

      const result = await splitPdf(file, options, (done, total) => setProgress((done / total) * 100));
      if (!result.ok) throw result.error;
      return result.outputs;
    });
  }

  function handleReset() {
    clearFile();
    setRangeInput("");
    setSeparateRangeFiles(false);
    setEveryN(1);
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
            zipFilename={`${file?.name.replace(/\.pdf$/i, "") ?? "split"}.zip`}
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
              setLoadError(null);
              setItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
            }}
            disabled={run.status === "running"}
          />
          <FileList
            items={items}
            onRemove={clearFile}
            onClearAll={clearFile}
            disabled={run.status === "running"}
          />
          {isLoadingThumbnails && <ProgressBar progress={null} label="Rendering page previews..." />}
          {thumbnails.length > 0 && (
            <PageThumbnailGrid
              items={thumbnails.map((dataUrl, i) => ({ key: i + 1, dataUrl }))}
              onThumbnailClick={handleThumbnailZoom}
            />
          )}
        </div>
      </ToolStep>

      {file && pageCount && !isLoadingThumbnails && (
        <ToolStep title="Step 2: Options">
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Split mode</legend>
              {MODES.map((m) => (
                <label key={m.value} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="split-mode"
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                    className="h-4 w-4 accent-accent"
                  />
                  {m.label}
                </label>
              ))}
            </fieldset>

            {mode === "range" && (
              <>
                <Input
                  label="Page range"
                  placeholder="1-3,7,9-11"
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                  hint={`This document has ${pageCount} pages.`}
                  error={rangeInput.length > 0 && rangeResult && !rangeResult.ok ? rangeResult.error.message : undefined}
                />
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={separateRangeFiles}
                    onChange={(e) => setSeparateRangeFiles(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  Split each comma-separated part into its own file, instead of merging them
                  into one
                </label>
              </>
            )}

            {mode === "every-n" && (
              <Input
                label="Pages per file"
                type="number"
                min={1}
                max={pageCount}
                value={everyN}
                onChange={(e) => setEveryN(Math.max(1, Number(e.target.value) || 1))}
                hint={everyNFileCount ? `Produces ${everyNFileCount} file${everyNFileCount === 1 ? "" : "s"}.` : undefined}
              />
            )}
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Splitting">
          <ProgressBar progress={run.progress} label="Splitting PDF..." />
        </ToolStep>
      ) : (
        file && (
          <Button type="button" disabled={!canRun} hint={!file ? "Add a PDF first." : isLoadingThumbnails ? "Loading page previews..." : "Fill in the split settings first."} onClick={handleSplit} className="self-start">
            {mode === "range" && rangeGroupsResult?.ok
              ? `Split into ${rangeGroupsResult.groups.length} files`
              : mode === "every-n" && everyNFileCount
                ? `Split into ${everyNFileCount} files`
                : "Split PDF"}
          </Button>
        )
      )}
      {zoomSrc && (
        <Lightbox
          src={zoomSrc}
          alt={`Page ${zoomPage}`}
          onClose={() => {
            setZoomPage(null);
            setZoomSrc(null);
          }}
        />
      )}
    </ToolShell>
  );
}
