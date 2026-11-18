"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import { errors } from "@/lib/errors";
import { detectImageType, processImageMetadata, type MetadataFindings } from "@/lib/image/strip-metadata";
import { splitExtension } from "@/lib/format";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";
import { useThumbnailUrls } from "@/hooks/useThumbnailUrls";
import type { OutputFile } from "@/lib/types";

const tool = getToolBySlug("strip-metadata")!;

/** One line per file: what was in it, in words a person would use. */
function describeFindings(findings: MetadataFindings): string {
  if (findings.items.length === 0) return "No metadata found";
  return findings.items.join(", ");
}

export default function StripMetadataPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [reports, setReports] = useState<{ name: string; findings: MetadataFindings }[]>([]);
  const thumbnailUrls = useThumbnailUrls(items);
  const run = useToolRun();

  async function handleAccepted(files: File[]) {
    if (run.status === "error") run.reset();
    const added: FileListItem[] = [];
    for (const file of files) {
      // A quick header-only read, so the list can say what each photo carries before anything is changed.
      let meta: string | undefined;
      try {
        const inspected = processImageMetadata(new Uint8Array(await file.arrayBuffer()), false);
        meta = inspected ? describeFindings(inspected.findings) : undefined;
      } catch {
        meta = "Could not be read";
      }
      added.push({ id: crypto.randomUUID(), file, meta });
    }
    setItems((current) => [...current, ...added]);
  }

  function handleRemove(id: string) {
    if (run.status === "error") run.reset();
    setItems((current) => current.filter((item) => item.id !== id));
  }

  const inputSizeBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  async function handleRun() {
    await run.run(async (setProgress) => {
      const outputs: OutputFile[] = [];
      const collected: { name: string; findings: MetadataFindings }[] = [];
      for (let i = 0; i < items.length; i++) {
        const { file } = items[i];
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!detectImageType(bytes)) throw errors.unsupportedType(file.name);

        let result;
        try {
          result = processImageMetadata(bytes, true);
        } catch (thrown) {
          throw errors.corruptFile(thrown instanceof Error ? thrown.message : String(thrown));
        }
        if (!result?.output) throw errors.unsupportedType(file.name);

        const { base, ext } = splitExtension(file.name);
        outputs.push({
          name: `${base}-clean${ext}`,
          blob: new Blob([new Uint8Array(result.output)], { type: result.type }),
          sizeBytes: result.output.length,
          mimeType: result.type,
        });
        collected.push({ name: file.name, findings: result.findings });
        setProgress(((i + 1) / items.length) * 100);
      }
      setReports(collected);
      return outputs;
    });
  }

  function handleReset() {
    setItems([]);
    setReports([]);
    run.reset();
  }

  if (run.status === "success") {
    return (
      <ToolShell tool={tool}>
        <ToolStep title="What was removed">
          <ul className="flex flex-col gap-2 text-sm">
            {reports.map((report) => (
              <li key={report.name} className="flex flex-col gap-0.5">
                <span className="font-mono text-foreground">{report.name}</span>
                <span className="text-muted-foreground">
                  {report.findings.items.length === 0
                    ? "Nothing to remove: this file had no metadata."
                    : `Removed: ${report.findings.items.join(", ")}.`}
                  {report.findings.keptOrientation
                    ? " The rotation flag was kept so the photo does not turn sideways."
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </ToolStep>
        <ToolStep title="Result">
          <ResultPanel
            outputs={run.outputs}
            elapsedMs={run.elapsedMs}
            inputSizeBytes={inputSizeBytes}
            zipFilename="clean-images.zip"
            onReset={handleReset}
          />
        </ToolStep>
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={tool} error={run.status === "error" ? run.error : null}>
      <ToolStep title="Step 1: Files">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-sm text-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p>
              Photos often carry the place they were taken, the camera, and the time. This removes
              that data without recompressing the picture, so the quality stays exactly the same.
            </p>
          </div>
          <FileDropzone
            accept={tool.accept}
            multiple={tool.multiple}
            maxFiles={tool.maxFiles}
            maxFileSizeMB={tool.maxFileSizeMB}
            currentCount={items.length}
            onAccepted={handleAccepted}
            disabled={run.status === "running"}
          />
          <FileList
            items={items.map((item) => ({ ...item, thumbnailUrl: thumbnailUrls[item.id] }))}
            onRemove={handleRemove}
            onClearAll={() => {
              run.reset();
              setItems([]);
            }}
            disabled={run.status === "running"}
          />
        </div>
      </ToolStep>

      {run.status === "running" ? (
        <ToolStep title="Removing metadata">
          <ProgressBar progress={run.progress} label="Cleaning images..." />
        </ToolStep>
      ) : (
        items.length > 0 && (
          <Button type="button" onClick={handleRun} className="self-start">
            Remove metadata from {items.length} image{items.length === 1 ? "" : "s"}
          </Button>
        )
      )}
    </ToolShell>
  );
}
