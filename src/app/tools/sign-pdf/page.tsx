"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import { signPdf, type SignTarget } from "@/lib/pdf/sign";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { SignaturePad } from "@/components/SignaturePad";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Slider } from "@/components/ui/Slider";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";
import { usePdfPagePreview } from "@/hooks/usePdfPagePreview";

const tool = getToolBySlug("sign-pdf")!;

type SignatureSource = "draw" | "upload";
type PageChoice = "last" | "first" | "page" | "all";

const SIGNATURE_IMAGE_ACCEPT = { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"] };

const PAGE_CHOICE_OPTIONS: { value: PageChoice; label: string }[] = [
  { value: "last", label: "Last page" },
  { value: "first", label: "First page" },
  { value: "page", label: "A specific page" },
  { value: "all", label: "Every page" },
];

interface Signature {
  blob: Blob;
  url: string;
  /** Height divided by width. */
  aspect: number;
  mimeType: "image/png" | "image/jpeg";
}

async function readImageAspect(blob: Blob): Promise<number> {
  const bitmap = await createImageBitmap(blob);
  const aspect = bitmap.height / bitmap.width;
  bitmap.close();
  return aspect;
}

export default function SignPdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [source, setSource] = useState<SignatureSource>("draw");
  const [signature, setSignature] = useState<Signature | null>(null);
  const [pageChoice, setPageChoice] = useState<PageChoice>("last");
  const [specificPage, setSpecificPage] = useState(1);
  const [centerX, setCenterX] = useState(0.75);
  const [centerY, setCenterY] = useState(0.85);
  const [widthPercent, setWidthPercent] = useState(25);
  const run = useToolRun();
  const dragging = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const file = items[0]?.file ?? null;
  const previewPage = pageChoice === "last" ? 0 : pageChoice === "page" ? specificPage : 1;
  const preview = usePdfPagePreview(file, previewPage);
  const pageCount = preview.pageCount;

  // Free the signature's object URL when it is replaced or the page closes.
  useEffect(() => {
    return () => {
      if (signature) URL.revokeObjectURL(signature.url);
    };
  }, [signature]);

  async function adoptSignature(blob: Blob | null, mimeType: Signature["mimeType"] = "image/png") {
    if (!blob) {
      setSignature(null);
      return;
    }
    try {
      const aspect = await readImageAspect(blob);
      setSignature({ blob, url: URL.createObjectURL(blob), aspect, mimeType });
    } catch {
      setSignature(null);
    }
  }

  function clearFile() {
    run.reset();
    setItems([]);
  }

  // The signature is kept whole inside the page, the same way signPdf clamps it.
  const widthFraction = widthPercent / 100;
  const halfWidth = widthFraction / 2;

  function moveTo(clientX: number, clientY: number) {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const fractionX = (clientX - rect.left) / rect.width;
    const fractionY = (clientY - rect.top) / rect.height;
    // Height as a fraction of the page height depends on the preview's own ratio.
    const heightFraction = signature ? (widthFraction * signature.aspect * rect.width) / rect.height : 0;
    setCenterX(Math.min(Math.max(fractionX, halfWidth), 1 - halfWidth));
    setCenterY(Math.min(Math.max(fractionY, heightFraction / 2), 1 - heightFraction / 2));
  }

  const target: SignTarget =
    pageChoice === "all"
      ? { kind: "all" }
      : pageChoice === "first"
        ? { kind: "first" }
        : pageChoice === "last"
          ? { kind: "last" }
          : { kind: "page", pageNumber: specificPage };

  const canRun = !!file && !!signature;

  async function handleRun() {
    if (!file || !signature) return;
    await run.run(async () => {
      const result = await signPdf(file, {
        imageBytes: await signature.blob.arrayBuffer(),
        imageMimeType: signature.mimeType,
        target,
        centerX,
        centerY,
        widthFraction,
      });
      if (!result.ok) throw result.error;
      return [result.output];
    });
  }

  function handleReset() {
    clearFile();
    setSignature(null);
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

  const running = run.status === "running";
  const pageInvalid = pageChoice === "page" && pageCount !== undefined && specificPage > pageCount;

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
              if (run.status === "error") run.reset();
              setItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
            }}
            disabled={running}
          />
          <FileList items={items} onRemove={clearFile} onClearAll={clearFile} disabled={running} />
        </div>
      </ToolStep>

      {file && (
        <ToolStep title="Step 2: Signature">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-sm text-foreground">
              <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p>
                This places a picture of your signature on the page. It is not a certified digital
                signature, and the file is not locked afterward.
              </p>
            </div>
            <fieldset className="flex flex-wrap gap-x-6 gap-y-2" disabled={running}>
              <legend className="mb-1 text-sm font-medium text-foreground">Signature</legend>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="signature-source"
                  checked={source === "draw"}
                  onChange={() => {
                    setSource("draw");
                    setSignature(null);
                  }}
                  className="h-4 w-4 accent-accent"
                />
                Draw it
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name="signature-source"
                  checked={source === "upload"}
                  onChange={() => {
                    setSource("upload");
                    setSignature(null);
                  }}
                  className="h-4 w-4 accent-accent"
                />
                Upload an image
              </label>
            </fieldset>

            {source === "draw" ? (
              <SignaturePad onChange={(blob) => adoptSignature(blob)} disabled={running} />
            ) : (
              <div className="flex flex-col gap-2">
                <FileDropzone
                  accept={SIGNATURE_IMAGE_ACCEPT}
                  multiple={false}
                  maxFiles={1}
                  maxFileSizeMB={20}
                  currentCount={signature ? 1 : 0}
                  onAccepted={(files) => {
                    const image = files[0];
                    if (image) {
                      void adoptSignature(
                        image,
                        image.type === "image/jpeg" ? "image/jpeg" : "image/png",
                      );
                    }
                  }}
                  disabled={running}
                />
                <p className="text-sm text-muted-foreground">
                  A PNG with a transparent background looks best. A JPEG keeps its white box.
                </p>
              </div>
            )}
          </div>
        </ToolStep>
      )}

      {file && signature && (
        <ToolStep title="Step 3: Place it">
          <div className="flex flex-col gap-4">
            <Select
              label="Pages to sign"
              options={PAGE_CHOICE_OPTIONS}
              value={pageChoice}
              onChange={(event) => setPageChoice(event.target.value as PageChoice)}
              disabled={running}
            />
            {pageChoice === "page" && (
              <Input
                label="Page number"
                type="number"
                min={1}
                max={pageCount}
                value={specificPage}
                onChange={(event) => setSpecificPage(Math.max(1, Number(event.target.value) || 1))}
                error={pageInvalid ? `This document has ${pageCount} pages.` : undefined}
                disabled={running}
              />
            )}

            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {pageChoice === "all"
                  ? "Showing page 1. The same spot is used on every page."
                  : preview.pageNumber
                    ? `Showing page ${preview.pageNumber}${pageCount ? ` of ${pageCount}` : ""}.`
                    : "Loading the page..."}{" "}
                Drag the signature, or click where it should go.
              </p>
              <div
                ref={stageRef}
                onPointerDown={(event) => {
                  if (running) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragging.current = true;
                  moveTo(event.clientX, event.clientY);
                }}
                onPointerMove={(event) => {
                  if (dragging.current) moveTo(event.clientX, event.clientY);
                }}
                onPointerUp={() => {
                  dragging.current = false;
                }}
                onPointerCancel={() => {
                  dragging.current = false;
                }}
                className="relative mx-auto w-full max-w-md touch-none select-none overflow-hidden rounded-md border border-border-strong bg-paper"
              >
                {preview.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local data URL rendered by pdf.js, not a remote asset
                  <img
                    src={preview.url}
                    alt={`Page ${preview.pageNumber ?? ""} of the PDF`}
                    draggable={false}
                    className={`block w-full ${preview.loading ? "opacity-50" : ""}`}
                  />
                ) : (
                  <div className="flex aspect-[3/4] items-center justify-center font-mono text-sm text-paper-foreground">
                    {preview.failed ? "This page could not be shown." : "Loading..."}
                  </div>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                <img
                  src={signature.url}
                  alt="Your signature, shown where it will be placed"
                  draggable={false}
                  style={{
                    left: `${centerX * 100}%`,
                    top: `${centerY * 100}%`,
                    width: `${widthPercent}%`,
                  }}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 outline outline-1 outline-dashed outline-accent"
                />
              </div>
            </div>

            <Slider
              label="Horizontal position"
              min={0}
              max={100}
              step={1}
              value={Math.round(centerX * 100)}
              onChange={(value) => setCenterX(Math.min(Math.max(value / 100, halfWidth), 1 - halfWidth))}
              formatValue={(value) => `${value}%`}
              disabled={running}
            />
            <Slider
              label="Vertical position"
              min={0}
              max={100}
              step={1}
              value={Math.round(centerY * 100)}
              onChange={(value) => {
                const stage = stageRef.current;
                const heightFraction =
                  signature && stage
                    ? (widthFraction * signature.aspect * stage.clientWidth) / stage.clientHeight
                    : 0;
                setCenterY(Math.min(Math.max(value / 100, heightFraction / 2), 1 - heightFraction / 2));
              }}
              formatValue={(value) => `${value}%`}
              disabled={running}
            />
            <Slider
              label="Size"
              min={8}
              max={60}
              step={1}
              value={widthPercent}
              onChange={setWidthPercent}
              formatValue={(value) => `${value}% of page width`}
              disabled={running}
            />
          </div>
        </ToolStep>
      )}

      {running ? (
        <ToolStep title="Signing">
          <ProgressBar progress={null} label="Placing the signature..." />
        </ToolStep>
      ) : (
        file && (
          <Button
            type="button"
            disabled={!canRun || pageInvalid}
            hint={pageInvalid ? "That page number is past the end of the PDF." : "Draw or upload a signature first."}
            onClick={handleRun}
            className="self-start"
          >
            Sign PDF
          </Button>
        )
      )}
    </ToolShell>
  );
}
