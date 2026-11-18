"use client";

import { useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import { ocrPdf, type OcrLanguage } from "@/lib/pdf/ocr";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ResultPanel } from "@/components/ResultPanel";
import { ProgressBar } from "@/components/ProgressBar";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";

const tool = getToolBySlug("ocr-pdf")!;

const LANGUAGE_OPTIONS: { value: OcrLanguage; label: string }[] = [
  { value: "eng", label: "English" },
  { value: "ind", label: "Indonesian" },
  { value: "eng+ind", label: "English + Indonesian" },
];

export default function OcrPdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [language, setLanguage] = useState<OcrLanguage>("eng");
  const run = useToolRun();

  const file = items[0]?.file ?? null;

  function clearFile() {
    run.reset();
    setItems([]);
  }

  async function handleRun() {
    if (!file) return;
    await run.run(async (setProgress) => {
      const result = await ocrPdf(file, { language }, (done, total) => setProgress((done / total) * 100));
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
        </div>
      </ToolStep>

      {file && (
        <ToolStep title="Step 2: Language">
          <div className="flex flex-col gap-4">
            <Select
              label="Text language in the document"
              options={LANGUAGE_OPTIONS}
              value={language}
              onChange={(e) => setLanguage(e.target.value as OcrLanguage)}
            />
            <p className="text-xs text-muted-foreground">
              Matching the actual language improves recognition accuracy.
            </p>
            <p className="text-xs text-muted-foreground">
              The first run downloads a one-time language file (a few MB) from this app&apos;s
              own server, not a third party, and caches it in your browser. The page stays
              exactly as it looks now; only a hidden, searchable text layer is added
              underneath.
            </p>
            <p className="text-xs text-muted-foreground">
              A page that already has real, selectable text is left as-is: only pages
              that are just an image (a scan or a photo) get a text layer added.
            </p>
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Reading pages">
          <ProgressBar progress={run.progress} label="Recognizing text... this can take a while for long documents." />
        </ToolStep>
      ) : (
        file && (
          <Button type="button" onClick={handleRun} className="self-start">
            Make searchable
          </Button>
        )
      )}
    </ToolShell>
  );
}
