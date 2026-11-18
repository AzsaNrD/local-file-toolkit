"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import { type AppError } from "@/lib/errors";
import { cropPdf, readFirstPageSize } from "@/lib/pdf/crop";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToolRun } from "@/hooks/useToolRun";
import { usePdfPagePreview } from "@/hooks/usePdfPagePreview";

const tool = getToolBySlug("crop-pdf")!;
const PT_PER_MM = 72 / 25.4;

type Side = "top" | "right" | "bottom" | "left";
const SIDES: { key: Side; label: string }[] = [
  { key: "top", label: "Top (mm)" },
  { key: "right", label: "Right (mm)" },
  { key: "bottom", label: "Bottom (mm)" },
  { key: "left", label: "Left (mm)" },
];

export default function CropPdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [margins, setMargins] = useState<Record<Side, number>>({ top: 10, right: 10, bottom: 10, left: 10 });
  const [pageSize, setPageSize] = useState<{ widthPt: number; heightPt: number } | null>(null);
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const run = useToolRun();

  const file = items[0]?.file ?? null;
  const preview = usePdfPagePreview(file, 1, 640);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    readFirstPageSize(file).then((result) => {
      if (cancelled) return;
      if (result.ok) setPageSize({ widthPt: result.widthPt, heightPt: result.heightPt });
      else setLoadError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  function clearFile() {
    run.reset();
    setItems([]);
    setPageSize(null);
    setLoadError(null);
  }

  function setMargin(side: Side, value: number) {
    setMargins((current) => ({ ...current, [side]: Number.isFinite(value) ? Math.max(0, value) : 0 }));
  }

  // Share of the page each edge takes, for the shaded strips in the preview.
  const share = (side: Side) => {
    if (!pageSize) return 0;
    const total = side === "top" || side === "bottom" ? pageSize.heightPt : pageSize.widthPt;
    return Math.min(100, ((margins[side] * PT_PER_MM) / total) * 100);
  };

  const noChange = SIDES.every(({ key }) => margins[key] === 0);

  async function handleRun() {
    if (!file) return;
    await run.run(async () => {
      const result = await cropPdf(file, {
        top: margins.top * PT_PER_MM,
        right: margins.right * PT_PER_MM,
        bottom: margins.bottom * PT_PER_MM,
        left: margins.left * PT_PER_MM,
      });
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
              setPageSize(null);
              setLoadError(null);
              setItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
            }}
            disabled={busy}
          />
          <FileList items={items} onRemove={clearFile} onClearAll={clearFile} disabled={busy} />
        </div>
      </ToolStep>

      {file && !loadError && (
        <ToolStep title="Step 2: Margins to trim">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SIDES.map(({ key, label }) => (
                <Input
                  key={key}
                  label={label}
                  type="number"
                  min={0}
                  step={1}
                  value={margins[key]}
                  disabled={busy}
                  onChange={(event) => setMargin(key, Number(event.target.value))}
                  className="font-mono tabular-nums"
                />
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              className="self-start"
              onClick={() => setMargins({ top: margins.top, right: margins.top, bottom: margins.top, left: margins.top })}
            >
              Use the top value on all sides
            </Button>

            <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-md border border-border bg-muted">
              {preview.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- local data URL from a canvas
                <img src={preview.url} alt="First page of the PDF" className="block h-auto w-full" />
              ) : (
                <div className="aspect-[3/4] w-full" />
              )}
              {pageSize && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                  <div className="absolute inset-x-0 top-0 bg-black/55" style={{ height: `${share("top")}%` }} />
                  <div className="absolute inset-x-0 bottom-0 bg-black/55" style={{ height: `${share("bottom")}%` }} />
                  <div
                    className="absolute bg-black/55"
                    style={{ left: 0, width: `${share("left")}%`, top: `${share("top")}%`, bottom: `${share("bottom")}%` }}
                  />
                  <div
                    className="absolute bg-black/55"
                    style={{ right: 0, width: `${share("right")}%`, top: `${share("top")}%`, bottom: `${share("bottom")}%` }}
                  />
                  <div
                    className="absolute border border-dashed border-accent"
                    style={{
                      left: `${share("left")}%`,
                      right: `${share("right")}%`,
                      top: `${share("top")}%`,
                      bottom: `${share("bottom")}%`,
                    }}
                  />
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              The preview shows page 1. The same margins are cut from every page.
            </p>

            <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-sm text-foreground">
              <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p>
                Cropping hides the trimmed edge but leaves it inside the file. To remove private
                details for good, use Redact PDF instead.
              </p>
            </div>
          </div>
        </ToolStep>
      )}

      {busy ? (
        <ToolStep title="Cropping">
          <ProgressBar progress={null} label="Trimming pages..." />
        </ToolStep>
      ) : (
        file &&
        !loadError && (
          <Button type="button" disabled={noChange} hint="Set a margin to trim first." onClick={handleRun} className="self-start">
            Crop PDF
          </Button>
        )
      )}
    </ToolShell>
  );
}
