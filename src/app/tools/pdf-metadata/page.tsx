"use client";

import { useEffect, useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import { type AppError } from "@/lib/errors";
import {
  EMPTY_PROPERTIES,
  readPdfProperties,
  writePdfProperties,
  type PdfProperties,
} from "@/lib/pdf/metadata";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToolRun } from "@/hooks/useToolRun";

const tool = getToolBySlug("pdf-metadata")!;

const FIELDS: { key: keyof PdfProperties; label: string; hint?: string }[] = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "subject", label: "Subject" },
  { key: "keywords", label: "Keywords", hint: "Separate with commas or spaces." },
  { key: "creator", label: "Created with", hint: "The program that made the original document." },
  { key: "producer", label: "Converted with", hint: "The program that last saved the PDF." },
];

export default function PdfMetadataPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [values, setValues] = useState<PdfProperties>(EMPTY_PROPERTIES);
  const [original, setOriginal] = useState<PdfProperties | null>(null);
  const [removeDates, setRemoveDates] = useState(false);
  const [removeXmp, setRemoveXmp] = useState(true);
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const run = useToolRun();

  const file = items[0]?.file ?? null;

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    readPdfProperties(file).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setOriginal(result.properties);
        setValues(result.properties);
      } else {
        setLoadError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  function clearFile() {
    run.reset();
    setItems([]);
    setOriginal(null);
    setValues(EMPTY_PROPERTIES);
    setLoadError(null);
  }

  async function handleRun() {
    if (!file) return;
    await run.run(async () => {
      const result = await writePdfProperties(file, values, { removeDates, removeXmp });
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
              setOriginal(null);
              setValues(EMPTY_PROPERTIES);
              setLoadError(null);
              setItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
            }}
            disabled={busy}
          />
          <FileList items={items} onRemove={clearFile} onClearAll={clearFile} disabled={busy} />
          {file && !original && !loadError && <ProgressBar progress={null} label="Reading properties..." />}
        </div>
      </ToolStep>

      {original && (
        <ToolStep title="Step 2: Properties">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FIELDS.map(({ key, label, hint }) => (
                <Input
                  key={key}
                  label={label}
                  hint={hint}
                  value={values[key]}
                  disabled={busy}
                  onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground">An empty field is removed from the file.</p>

            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={removeDates}
                  disabled={busy}
                  onChange={(event) => setRemoveDates(event.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Remove the creation and modification dates
              </label>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={removeXmp}
                  disabled={busy}
                  onChange={(event) => setRemoveXmp(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-accent"
                />
                <span>
                  Also remove the hidden copy of these properties and the edit history
                  <span className="block text-muted-foreground">
                    Editing programs keep a second record that would still show the old values.
                  </span>
                </span>
              </label>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              className="self-start"
              onClick={() => {
                setValues(EMPTY_PROPERTIES);
                setRemoveDates(true);
                setRemoveXmp(true);
              }}
            >
              Clear everything
            </Button>
          </div>
        </ToolStep>
      )}

      {busy ? (
        <ToolStep title="Saving">
          <ProgressBar progress={null} label="Writing properties..." />
        </ToolStep>
      ) : (
        original && (
          <Button type="button" onClick={handleRun} className="self-start">
            Save PDF
          </Button>
        )
      )}
    </ToolShell>
  );
}
