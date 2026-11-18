"use client";

import { useEffect, useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import type { PageComparison, PageVerdict } from "@/lib/pdf/compare";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Lightbox } from "@/components/Lightbox";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";

const tool = getToolBySlug("compare-pdf")!;

const VERDICT_TEXT: Record<PageVerdict, string> = {
  same: "No visible change",
  changed: "Changed",
  "size-differs": "Page size is different",
  "only-original": "Only in the original",
  "only-revised": "Only in the revised file",
};

export default function ComparePdfPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [pages, setPages] = useState<PageComparison[]>([]);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [zoomed, setZoomed] = useState<number | null>(null);
  const run = useToolRun();

  const labelled = items.map((item, index) => ({
    ...item,
    meta: index === 0 ? "Original" : "Revised",
  }));

  useEffect(() => {
    const created: Record<number, string> = {};
    for (const entry of pages) {
      if (entry.highlight) created[entry.page] = URL.createObjectURL(entry.highlight);
    }
    // Object URLs are browser resources created from the comparison result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrls(created);
    return () => {
      for (const url of Object.values(created)) URL.revokeObjectURL(url);
    };
  }, [pages]);

  function handleReset() {
    run.reset();
    setItems([]);
    setPages([]);
    setZoomed(null);
  }

  async function handleRun() {
    if (items.length !== 2) return;
    await run.run(async (setProgress) => {
      const { comparePdfs } = await import("@/lib/pdf/compare");
      const result = await comparePdfs(items[0].file, items[1].file, (done, total) =>
        setProgress((done / total) * 100),
      );
      if (!result.ok) throw result.error;
      setPages(result.pages);
      return result.report ? [result.report] : [];
    });
  }

  if (run.status === "success") {
    const differing = pages.filter((entry) => entry.verdict !== "same");
    return (
      <ToolShell tool={tool}>
        <ToolStep title="What changed">
          {differing.length === 0 ? (
            <p className="text-sm text-foreground">
              No visible differences. All {pages.length} page{pages.length === 1 ? "" : "s"} look the same.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="font-mono text-sm tabular-nums text-muted-foreground">
                {differing.length} of {pages.length} page{pages.length === 1 ? "" : "s"} differ. The changed
                areas are marked in red on the revised page.
              </p>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {differing.map((entry) => (
                  <li key={entry.page} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
                    <p className="font-mono text-sm text-foreground">
                      Page {entry.page}: {VERDICT_TEXT[entry.verdict]}
                      {entry.verdict === "changed" ? ` (${Math.max(1, Math.round(entry.changedShare * 100))}% of the page)` : ""}
                    </p>
                    {urls[entry.page] && (
                      <button
                        type="button"
                        onClick={() => setZoomed(entry.page)}
                        aria-label={`Enlarge the marked page ${entry.page}`}
                        className="overflow-hidden rounded border border-border focus-ring"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                        <img src={urls[entry.page]} alt="" className="block h-auto w-full" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {zoomed !== null && urls[zoomed] && (
            <Lightbox src={urls[zoomed]} alt={`Page ${zoomed} with changes marked`} onClose={() => setZoomed(null)} />
          )}
        </ToolStep>
        <ToolStep title="Result">
          {run.outputs.length > 0 ? (
            <ResultPanel outputs={run.outputs} elapsedMs={run.elapsedMs} onReset={handleReset} />
          ) : (
            <Button type="button" variant="secondary" onClick={handleReset} className="self-start">
              Compare other files
            </Button>
          )}
        </ToolStep>
      </ToolShell>
    );
  }

  const busy = run.status === "running";

  return (
    <ToolShell tool={tool} error={run.status === "error" ? run.error : null}>
      <ToolStep title="Step 1: Two files">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Add the original first and the revised version second. The order can be changed in the list.
          </p>
          <FileDropzone
            accept={tool.accept}
            multiple
            maxFiles={2}
            maxFileSizeMB={tool.maxFileSizeMB}
            currentCount={items.length}
            onAccepted={(files) => {
              if (run.status === "error") run.reset();
              setItems((current) =>
                [...current, ...files.map((f) => ({ id: crypto.randomUUID(), file: f }))].slice(0, 2),
              );
            }}
            disabled={busy}
          />
          <FileList
            items={labelled}
            reorderable
            onReorder={(next) => setItems(next.map(({ id, file }) => ({ id, file })))}
            onRemove={(id) => setItems((current) => current.filter((item) => item.id !== id))}
            onClearAll={() => {
              run.reset();
              setItems([]);
            }}
            disabled={busy}
          />
        </div>
      </ToolStep>

      {busy ? (
        <ToolStep title="Comparing">
          <ProgressBar progress={run.progress} label="Comparing page by page..." />
        </ToolStep>
      ) : (
        items.length > 0 && (
          <Button type="button" disabled={items.length !== 2} hint="Add exactly 2 PDFs to compare." onClick={handleRun} className="self-start">
            {items.length === 2 ? "Compare" : "Add one more PDF to compare"}
          </Button>
        )
      )}
    </ToolShell>
  );
}
