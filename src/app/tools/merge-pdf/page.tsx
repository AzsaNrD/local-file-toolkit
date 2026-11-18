"use client";

import { useEffect, useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import { loadPdf } from "@/lib/pdf/load";
import { mergePdfs } from "@/lib/pdf/merge";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";

const tool = getToolBySlug("merge-pdf")!;

export default function MergePdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const run = useToolRun();

  // Best-effort page-count annotation per file (Section 10.4); a file that
  // fails to load here (encrypted/corrupt) surfaces its real error later,
  // when the user actually runs the merge.
  useEffect(() => {
    let cancelled = false;
    for (const item of items) {
      if (item.meta !== undefined) continue;
      item.file
        .arrayBuffer()
        .then((bytes) => loadPdf(bytes))
        .then((loaded) => {
          if (cancelled) return;
          const pageCount = loaded.ok ? loaded.doc.getPageCount() : 0;
          setItems((current) =>
            current.map((row) =>
              row.id === item.id
                ? {
                    ...row,
                    meta: loaded.ok
                      ? `${pageCount} page${pageCount === 1 ? "" : "s"}`
                      : loaded.error.code === "ENCRYPTED_PDF"
                        ? "password protected"
                        : "could not be read",
                  }
                : row,
            ),
          );
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [items]);

  function handleAccepted(files: File[]) {
    if (run.status === "error") run.reset();
    setItems((current) => [
      ...current,
      ...files.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  }

  function handleRemove(id: string) {
    if (run.status === "error") run.reset();
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function handleReset() {
    setItems([]);
    run.reset();
  }

  const canMerge = items.length >= 2;
  const inputSizeBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  async function handleMerge() {
    await run.run(async (setProgress) => {
      const result = await mergePdfs(
        items.map((item) => item.file),
        (done, total) => setProgress((done / total) * 100),
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
            inputSizeBytes={inputSizeBytes}
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
            reorderable
            onReorder={setItems}
            disabled={run.status === "running"}
          />
          {items.length === 1 && (
            <p className="text-sm text-danger">Add at least one more PDF to merge.</p>
          )}
          {items.length >= 2 && (
            <p className="text-xs text-muted-foreground">
              Bookmarks and form fields in the original files are not preserved in the merged
              PDF.
            </p>
          )}
        </div>
      </ToolStep>

      {run.status === "running" ? (
        <ToolStep title="Merging">
          <ProgressBar progress={run.progress} label="Merging PDFs..." />
        </ToolStep>
      ) : (
        <Button type="button" disabled={!canMerge} hint={items.length === 0 ? "Add at least 2 PDFs to merge." : null} onClick={handleMerge} className="self-start">
          Merge {items.length > 0 ? `${items.length} file${items.length === 1 ? "" : "s"}` : "PDFs"}
        </Button>
      )}
    </ToolShell>
  );
}
