"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import { errors, toAppError, type AppError } from "@/lib/errors";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { CapabilityGate } from "@/components/CapabilityGate";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";
import type { OutputFile } from "@/lib/types";

const tool = getToolBySlug("office-to-pdf")!;

async function convertOneFile(
  file: File,
): Promise<{ ok: true; output: OutputFile } | { ok: false; error: AppError }> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/convert/office-to-pdf", { method: "POST", body: formData });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return {
        ok: false,
        error: body?.code ? (body as AppError) : errors.conversionFailed(`HTTP ${response.status}`),
      };
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    const name = match?.[1] ?? `${file.name}.pdf`;

    return {
      ok: true,
      output: { name, blob, sizeBytes: blob.size, mimeType: "application/pdf" },
    };
  } catch (thrown) {
    return { ok: false, error: toAppError(thrown) };
  }
}

export default function OfficeToPdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const run = useToolRun();

  function handleAccepted(files: File[]) {
    if (run.status === "error") run.reset();
    setItems((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  function handleRemove(id: string) {
    if (run.status === "error") run.reset();
    setItems((current) => current.filter((item) => item.id !== id));
  }

  const inputSizeBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  async function handleRun() {
    await run.run(async (setProgress) => {
      const outputs: OutputFile[] = [];
      const failures: string[] = [];

      // Sequential, not parallel (PRD 12.4): two LibreOffice processes
      // sharing a profile directory conflict with each other.
      for (let i = 0; i < items.length; i++) {
        setProgress(
          items.length === 1 ? null : (i / items.length) * 100,
          items.length > 1 ? `File ${i + 1} of ${items.length} · ${items[i].file.name}` : items[i].file.name,
        );
        const result = await convertOneFile(items[i].file);
        if (result.ok) {
          outputs.push(result.output);
        } else {
          failures.push(`${items[i].file.name}: ${result.error.message}`);
        }
        setProgress(((i + 1) / items.length) * 100);
      }

      for (const failure of failures) toast.error(failure);

      if (outputs.length === 0) {
        throw errors.conversionFailed("every file in the batch failed");
      }
      return outputs;
    });
  }

  function handleReset() {
    setItems([]);
    run.reset();
  }

  if (run.status === "success") {
    return (
      <ToolShell tool={tool}>
        <ToolStep title="Result">
          <ResultPanel
            outputs={run.outputs}
            elapsedMs={run.elapsedMs}
            inputSizeBytes={inputSizeBytes}
            zipFilename="converted.zip"
            onReset={handleReset}
          />
        </ToolStep>
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={tool} error={run.status === "error" ? run.error : null}>
      <CapabilityGate capability={["word", "libreoffice"]}>
        <ToolStep title="Step 1: Files">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-sm text-foreground">
              <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p>
                This tool sends the file to the local converter running on this computer. It does
                not leave your machine. It uses Microsoft Office when that is installed and not
                already open, and LibreOffice otherwise.
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
              items={items}
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
          <ToolStep title="Converting">
            <ProgressBar progress={run.progress} label="Converting files, one at a time..." detail={run.detail} />
          </ToolStep>
        ) : (
          items.length > 0 && (
            <Button type="button" onClick={handleRun} className="self-start">
              Convert {items.length} file{items.length === 1 ? "" : "s"}
            </Button>
          )
        )}
      </CapabilityGate>
    </ToolShell>
  );
}
