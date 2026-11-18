"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, Download, FileText, RotateCcw } from "lucide-react";
import { formatBytes, formatDuration, formatPercentChange, splitExtension } from "@/lib/format";
import { downloadAsZip, triggerDownload } from "@/lib/download";
import { Button } from "@/components/ui/Button";
import { Lightbox } from "@/components/Lightbox";
import { UseInAnotherTool } from "@/components/UseInAnotherTool";
import { useOutputPreviews } from "@/hooks/useOutputPreviews";
import type { OutputFile } from "@/lib/types";

export interface ResultPanelProps {
  outputs: OutputFile[];
  elapsedMs: number | null;
  /** Total size of the input files, for the size-change summary (PRD 8: shared conventions). */
  inputSizeBytes?: number;
  zipFilename?: string;
  onReset: () => void;
}

export function ResultPanel({
  outputs,
  elapsedMs,
  inputSizeBytes,
  zipFilename = "local-file-toolkit-output.zip",
  onReset,
}: ResultPanelProps) {
  // Keyed by index, not name: within one result set, outputs already have
  // unique names, and the index is stable for the life of this result.
  const [customBases, setCustomBases] = useState<Record<number, string>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const previews = useOutputPreviews(outputs);
  const panelRef = useRef<HTMLDivElement>(null);

  // Success replaces the whole page, so keyboard focus would otherwise drop
  // to <body>. Land on the result so screen readers announce it.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);
  const outputSizeBytes = outputs.reduce((sum, output) => sum + output.sizeBytes, 0);

  function downloadName(output: OutputFile, index: number): string {
    const { base: originalBase, ext } = splitExtension(output.name);
    const base = customBases[index]?.trim() || originalBase;
    return `${base}${ext}`;
  }

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="group"
      aria-label="Result ready"
      className="animate-result-in flex flex-col gap-4 outline-none"
    >
      <p className="flex items-center gap-2 font-mono text-sm font-semibold text-foreground">
        <CircleCheck aria-hidden="true" className="h-5 w-5 text-accent" />
        Done · {outputs.length} file{outputs.length === 1 ? "" : "s"} ready
      </p>
      {inputSizeBytes !== undefined && (
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatBytes(inputSizeBytes)} &rarr; {formatBytes(outputSizeBytes)} (
          {formatPercentChange(inputSizeBytes, outputSizeBytes)})
          {elapsedMs !== null ? ` · ${formatDuration(elapsedMs)}` : ""}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {outputs.map((output, index) => {
          const { base: originalBase, ext } = splitExtension(output.name);
          return (
            <li
              key={`${output.name}-${index}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-surface px-3 py-2"
            >
              {previews[index] ? (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  aria-label={`Enlarge preview for ${output.name}`}
                  className="h-11 w-11 shrink-0 overflow-hidden rounded border border-border focus-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object/data URL, not a remote/optimizable asset */}
                  <img src={previews[index]} alt="" className="h-full w-full object-cover" />
                </button>
              ) : (
                <FileText aria-hidden="true" className="h-6 w-6 shrink-0 text-muted-foreground" />
              )}
              <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={customBases[index] ?? originalBase}
                    onChange={(event) =>
                      setCustomBases((current) => ({ ...current, [index]: event.target.value }))
                    }
                    aria-label={`File name for ${output.name}, before the ${ext} extension`}
                    className="h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 font-mono text-sm text-foreground focus-ring focus-visible:border-accent"
                  />
                  <span className="shrink-0 font-mono text-sm text-muted-foreground">{ext}</span>
                </div>
                <p className="font-mono text-xs tabular-nums text-muted-foreground">{formatBytes(output.sizeBytes)}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => triggerDownload(output.blob, downloadName(output, index))}
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Download
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3">
        {outputs.length > 1 && (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              downloadAsZip(
                outputs.map((output, index) => ({ name: downloadName(output, index), blob: output.blob })),
                zipFilename,
              )
            }
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Download all as ZIP
          </Button>
        )}
        <UseInAnotherTool
          outputs={outputs}
          getFiles={() =>
            outputs.map(
              (output, index) =>
                new File([output.blob], downloadName(output, index), { type: output.mimeType }),
            )
          }
        />
        <Button type="button" variant="ghost" onClick={onReset}>
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          Start over
        </Button>
      </div>
      {lightboxIndex !== null && previews[lightboxIndex] && (
        <Lightbox
          src={previews[lightboxIndex]}
          alt={outputs[lightboxIndex].name}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
