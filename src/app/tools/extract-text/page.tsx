"use client";

import { useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import { extractTextFromPdf } from "@/lib/pdf/extract-text";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ResultPanel } from "@/components/ResultPanel";
import { ProgressBar } from "@/components/ProgressBar";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";

const tool = getToolBySlug("extract-text")!;

export default function ExtractTextPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const run = useToolRun();

  const file = items[0]?.file ?? null;

  function clearFile() {
    run.reset();
    setItems([]);
  }

  async function handleRun() {
    if (!file) return;
    await run.run(async (setProgress) => {
      const result = await extractTextFromPdf(file, (done, total) => setProgress((done / total) * 100));
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
            disabled={run.status === "running"}
          />
          <FileList items={items} onRemove={clearFile} onClearAll={clearFile} disabled={run.status === "running"} />
          <p className="text-xs text-muted-foreground">
            Text is read line by line from each page&apos;s layout, so complex
            columns or tables may not come out in the original order.
          </p>
        </div>
      </ToolStep>

      {run.status === "running" ? (
        <ToolStep title="Reading">
          <ProgressBar progress={run.progress} label="Extracting text..." />
        </ToolStep>
      ) : (
        file && (
          <Button type="button" onClick={handleRun} className="self-start">
            Extract text
          </Button>
        )
      )}
    </ToolShell>
  );
}
