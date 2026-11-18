"use client";

import { useEffect, useMemo, useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import { type AppError } from "@/lib/errors";
import { basenameOf } from "@/lib/pdf/load";
import type { ExtractedImage } from "@/lib/pdf/extract-images";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToolRun } from "@/hooks/useToolRun";
import { useStoredState } from "@/hooks/useStoredState";
import { formatBytes } from "@/lib/format";

const tool = getToolBySlug("extract-images")!;

const MIN_SIZE_OPTIONS = [
  { value: "0", label: "Every picture" },
  { value: "64", label: "Skip tiny ones (under 64 px)" },
  { value: "200", label: "Only larger pictures (over 200 px)" },
];

export default function ExtractImagesPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [found, setFound] = useState<ExtractedImage[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [scanProgress, setScanProgress] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const [minSize, setMinSize] = useStoredState("extract-images.min", "64", (value): value is string =>
    MIN_SIZE_OPTIONS.some((option) => option.value === value),
  );
  const run = useToolRun();

  const file = items[0]?.file ?? null;

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      // pdfjs-dist must only ever be loaded in the browser (PRD 12.1.4).
      const { extractPdfImages } = await import("@/lib/pdf/extract-images");
      const result = await extractPdfImages(file, (done, total) => {
        if (!cancelled) setScanProgress((done / total) * 100);
      });
      if (cancelled) return;
      setScanProgress(null);
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setFound(result.images);
      setTruncated(result.truncated);
      setUrls(Object.fromEntries(result.images.map((image) => [image.id, URL.createObjectURL(image.blob)])));
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  // Preview addresses live only as long as the list they belong to.
  useEffect(() => {
    return () => {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    };
  }, [urls]);

  const minPx = Number(minSize);
  const visible = useMemo(
    () => (found ?? []).filter((image) => Math.max(image.width, image.height) >= minPx),
    [found, minPx],
  );
  const chosen = visible.filter((image) => !skipped.has(image.id));

  function clearFile() {
    run.reset();
    setItems([]);
    setFound(null);
    setUrls({});
    setSkipped(new Set());
    setScanProgress(null);
    setTruncated(false);
    setLoadError(null);
  }

  function toggle(id: string) {
    setSkipped((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRun() {
    if (!file) return;
    await run.run(async () => {
      const base = basenameOf(file.name);
      return chosen.map((image, index) => ({
        name: `${base}-p${image.page}-${index + 1}.png`,
        blob: image.blob,
        sizeBytes: image.blob.size,
        mimeType: "image/png",
      }));
    });
  }

  if (run.status === "success") {
    return (
      <ToolShell tool={tool}>
        <ToolStep title="Result">
          <ResultPanel
            outputs={run.outputs}
            elapsedMs={run.elapsedMs}
            zipFilename={`${file ? basenameOf(file.name) : "pdf"}-images.zip`}
            onReset={clearFile}
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
              setFound(null);
              setUrls({});
              setSkipped(new Set());
              setLoadError(null);
              setScanProgress(0);
              setItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
            }}
          />
          <FileList items={items} onRemove={clearFile} onClearAll={clearFile} />
          {scanProgress !== null && <ProgressBar progress={scanProgress} label="Looking for pictures..." />}
        </div>
      </ToolStep>

      {found && found.length === 0 && (
        <ToolStep title="Step 2: Pictures">
          <p className="text-sm text-muted-foreground">
            No embedded pictures were found. If the pages look like pictures, they may be drawn as
            shapes and text instead; the PDF to images tool can save the whole page.
          </p>
        </ToolStep>
      )}

      {found && found.length > 0 && (
        <ToolStep title="Step 2: Choose pictures">
          <div className="flex flex-col gap-4">
            <div className="max-w-xs">
              <Select
                label="Size filter"
                options={MIN_SIZE_OPTIONS}
                value={minSize}
                onChange={(event) => setMinSize(event.target.value)}
              />
            </div>
            <p role="status" className="font-mono text-sm tabular-nums text-muted-foreground">
              {chosen.length} of {visible.length} selected
              {found.length !== visible.length ? ` · ${found.length - visible.length} hidden by the filter` : ""}
              {truncated ? " · stopped at the first 300 pictures" : ""}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setSkipped(new Set())}>
                Select all
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSkipped(new Set(visible.map((image) => image.id)))}
              >
                Select none
              </Button>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((image) => {
                const selected = !skipped.has(image.id);
                return (
                  <li key={image.id}>
                    <label
                      className={`flex h-full cursor-pointer flex-col gap-2 rounded-md border p-2 transition-colors ${
                        selected ? "border-accent bg-surface" : "border-border bg-surface opacity-70"
                      }`}
                    >
                      <span className="flex aspect-square items-center justify-center overflow-hidden rounded bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                        <img
                          src={urls[image.id]}
                          alt={`Picture from page ${image.page}`}
                          className="max-h-full max-w-full object-contain"
                        />
                      </span>
                      <span className="flex items-center gap-2 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggle(image.id)}
                          className="h-4 w-4 accent-accent"
                        />
                        <span className="font-mono text-xs tabular-nums">
                          p.{image.page} · {image.width}×{image.height} · {formatBytes(image.blob.size)}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Saving">
          <ProgressBar progress={null} label="Collecting pictures..." />
        </ToolStep>
      ) : (
        found &&
        found.length > 0 && (
          <Button type="button" disabled={chosen.length === 0} hint="Select at least one picture." onClick={handleRun} className="self-start">
            Save {chosen.length} picture{chosen.length === 1 ? "" : "s"}
          </Button>
        )
      )}
    </ToolShell>
  );
}
