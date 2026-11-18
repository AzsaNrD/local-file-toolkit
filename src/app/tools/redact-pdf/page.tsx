"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ShieldAlert, X } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import { redactPdf, type RedactBox } from "@/lib/pdf/redact";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { RedactOverlay } from "@/components/RedactOverlay";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToolRun } from "@/hooks/useToolRun";
import { usePdfPagePreview } from "@/hooks/usePdfPagePreview";
import { useStoredState } from "@/hooks/useStoredState";

const tool = getToolBySlug("redact-pdf")!;

const QUALITY_OPTIONS = [
  { value: "150", label: "Standard (150 dpi)" },
  { value: "200", label: "Sharper (200 dpi, larger file)" },
  { value: "110", label: "Smaller file (110 dpi)" },
];

export default function RedactPdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [page, setPage] = useState(1);
  const [boxes, setBoxes] = useState<Record<number, RedactBox[]>>({});
  const [dpi, setDpi] = useStoredState("redact-pdf.dpi", "150", (value): value is string =>
    QUALITY_OPTIONS.some((option) => option.value === value),
  );
  const run = useToolRun();

  const file = items[0]?.file ?? null;
  const preview = usePdfPagePreview(file, page, 800);
  const pageCount = preview.pageCount ?? 0;

  const totalBoxes = Object.values(boxes).reduce((sum, list) => sum + list.length, 0);
  const pagesWithBoxes = Object.keys(boxes).filter((key) => boxes[Number(key)].length > 0).length;
  const current = boxes[page] ?? [];

  function clearFile() {
    run.reset();
    setItems([]);
    setPage(1);
    setBoxes({});
  }

  function removeBox(index: number) {
    setBoxes((all) => ({ ...all, [page]: (all[page] ?? []).filter((_, i) => i !== index) }));
  }

  async function handleRun() {
    if (!file) return;
    await run.run(async (setProgress) => {
      const result = await redactPdf(file, boxes, { dpi: Number(dpi) }, (done, total) =>
        setProgress((done / total) * 100),
      );
      if (!result.ok) throw result.error;
      return [result.output];
    });
  }

  if (run.status === "success") {
    return (
      <ToolShell tool={tool}>
        <ToolStep title="Result">
          <ResultPanel
            outputs={run.outputs}
            elapsedMs={run.elapsedMs}
            inputSizeBytes={file?.size}
            onReset={clearFile}
          />
        </ToolStep>
      </ToolShell>
    );
  }

  const busy = run.status === "running";

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
              run.reset();
              setPage(1);
              setBoxes({});
              setItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
            }}
            disabled={busy}
          />
          <FileList items={items} onRemove={clearFile} onClearAll={clearFile} disabled={busy} />
        </div>
      </ToolStep>

      {file && (
        <ToolStep title="Step 2: Cover what must go">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-sm text-foreground">
              <ShieldAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <p>
                Pages with a black box are turned into pictures, so the covered words are really gone,
                not just hidden. Those pages can no longer be searched or selected. Pages without a
                box are left as they are.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy || page <= 1}
                aria-label="Previous page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="w-11 px-0"
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </Button>
              <p role="status" className="min-w-24 text-center font-mono text-sm tabular-nums text-foreground">
                Page {page}
                {pageCount ? ` of ${pageCount}` : ""}
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy || page >= pageCount}
                aria-label="Next page"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="w-11 px-0"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-md border border-border bg-muted">
              {preview.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- local data URL from a canvas
                <img src={preview.url} alt={`Page ${page}`} draggable={false} className="block h-auto w-full" />
              ) : (
                <div className="aspect-[3/4] w-full" />
              )}
              {preview.url && (
                <RedactOverlay
                  boxes={current}
                  disabled={busy || preview.loading}
                  onAdd={(box) => setBoxes((all) => ({ ...all, [page]: [...(all[page] ?? []), box] }))}
                />
              )}
              {preview.loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <ProgressBar progress={null} label="Loading page..." />
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Drag on the page to draw a black box.</p>

            {current.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label={`Boxes on page ${page}`}>
                {current.map((_, index) => (
                  <li
                    key={index}
                    className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-1"
                  >
                    <span className="font-mono text-sm text-foreground">Box {index + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      aria-label={`Remove box ${index + 1} on page ${page}`}
                      onClick={() => removeBox(index)}
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="max-w-xs">
              <Select
                label="Quality of redacted pages"
                options={QUALITY_OPTIONS}
                value={dpi}
                disabled={busy}
                onChange={(event) => setDpi(event.target.value)}
              />
            </div>
          </div>
        </ToolStep>
      )}

      {busy ? (
        <ToolStep title="Redacting">
          <ProgressBar progress={run.progress} label="Drawing and flattening pages..." />
        </ToolStep>
      ) : (
        file && (
          <Button type="button" disabled={totalBoxes === 0} hint="Draw a box over what to cover first." onClick={handleRun} className="self-start">
            {totalBoxes === 0
              ? "Draw a box to redact"
              : `Redact ${totalBoxes} area${totalBoxes === 1 ? "" : "s"} on ${pagesWithBoxes} page${pagesWithBoxes === 1 ? "" : "s"}`}
          </Button>
        )
      )}
    </ToolShell>
  );
}
