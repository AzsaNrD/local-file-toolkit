"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import {
  getPdfInfo,
  formatPageDimensions,
  pdfInfosToCsv,
  type PdfInfo,
  type PdfInfoResult,
} from "@/lib/pdf/info";
import { errors } from "@/lib/errors";
import { formatBytes, formatDate } from "@/lib/format";
import { triggerDownload } from "@/lib/download";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ProgressBar } from "@/components/ProgressBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useFirstPagePreviews } from "@/hooks/useFirstPagePreviews";

const tool = getToolBySlug("pdf-info")!;

const METADATA_FIELDS: { key: keyof PdfInfo; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "author", label: "Author" },
  { key: "subject", label: "Subject" },
  { key: "keywords", label: "Keywords" },
  { key: "creator", label: "Created with" },
  { key: "producer", label: "Produced with" },
];

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-mono text-sm tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 font-mono text-sm font-medium text-foreground">{children}</h3>;
}

function PdfInfoBody({ info }: { info: PdfInfo }) {
  const metadataEntries = METADATA_FIELDS.filter(
    ({ key }) => typeof info[key] === "string" && info[key],
  );
  const hasDates = !!(info.creationDate || info.modificationDate);

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-3 gap-4">
        <Field label="File size" value={formatBytes(info.fileSizeBytes)} />
        <Field label="PDF version" value={info.pdfVersion ? `PDF ${info.pdfVersion}` : "Unknown"} />
        <Field label="Pages" value={`${info.pageCount}`} />
      </dl>

      <section>
        <SectionHeading>Page size and printing</SectionHeading>
        {info.pageSizeGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">This PDF has no pages.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {info.pageSizeGroups.map((group) => (
                <li key={group.pageRange} className="rounded-md border border-border px-3 py-2">
                  <p className="text-sm font-medium text-foreground">
                    {group.pageCount === info.pageCount
                      ? "All pages"
                      : `Page${group.pageCount === 1 ? "" : "s"} ${group.pageRange}`}
                    {group.paperSize && (
                      <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        {group.paperSize}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatPageDimensions(group.widthPt, group.heightPt)} · {group.orientation}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-sm text-foreground">{info.printRecommendation}</p>
          </div>
        )}
      </section>

      <section>
        <SectionHeading>Changes and signatures</SectionHeading>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-foreground">
            Saved {info.revisionCount} time{info.revisionCount === 1 ? "" : "s"} onto the same file.
            <span className="mt-1 block text-xs text-muted-foreground">
              Counted from the file&apos;s save markers. Saving under a new name or printing to PDF
              starts the count over, so a low number does not prove nothing changed.
            </span>
          </p>

          {info.editHistory.length > 0 ? (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Edit history recorded by the software that made this file ({info.editHistory.length}{" "}
                {info.editHistory.length === 1 ? "entry" : "entries"})
              </p>
              <ul className="flex flex-col gap-1.5">
                {info.editHistory.slice(-6).map((entry, index) => (
                  <li key={index} className="text-sm text-foreground">
                    <span className="capitalize">{entry.action}</span>
                    {entry.software && <span className="text-muted-foreground"> · {entry.software}</span>}
                    {entry.when && <span className="text-muted-foreground"> · {formatDate(entry.when)}</span>}
                  </li>
                ))}
              </ul>
              {info.editHistory.length > 6 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Showing the latest 6 of {info.editHistory.length}.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This file records no edit history. Many programs do not write one.
            </p>
          )}

          {info.signatures.length > 0 ? (
            <div className="flex flex-col gap-2">
              {info.signatures.map((signature) => (
                <div key={signature.fieldName} className="rounded-md border border-border px-3 py-2">
                  <p className="text-sm font-medium text-foreground">
                    {signature.signed
                      ? (signature.certificateHolder ?? signature.signerName ?? "Signed, signer not named")
                      : "Empty signature field"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {signature.signed
                      ? [
                          signature.signedAt ? `Signed ${formatDate(signature.signedAt)}` : null,
                          signature.reason ? `Reason: ${signature.reason}` : null,
                          signature.location ? `Location: ${signature.location}` : null,
                          signature.changedAfterSigning === null
                            ? null
                            : signature.changedAfterSigning
                              ? "Saved again after signing"
                              : "No changes after signing",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : `Field "${signature.fieldName}" has not been signed.`}
                  </p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Shown as stored in the file. Local File Toolkit does not check that a signature is valid or
                that its certificate is trusted; use a PDF reader&apos;s signature panel for that.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not digitally signed.</p>
          )}
        </div>
      </section>

      <section>
        <SectionHeading>Document metadata</SectionHeading>
        {metadataEntries.length > 0 || hasDates ? (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {metadataEntries.map(({ key, label }) => (
              <Field key={key} label={label} value={info[key] as string} />
            ))}
            {info.creationDate && <Field label="Created" value={formatDate(info.creationDate)} />}
            {info.modificationDate && <Field label="Modified" value={formatDate(info.modificationDate)} />}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            This file has no document metadata (title, author, or similar) set.
          </p>
        )}
      </section>
    </div>
  );
}

export default function PdfInfoPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [results, setResults] = useState<Record<string, PdfInfoResult>>({});
  const started = useRef(new Set<string>());
  const previews = useFirstPagePreviews(items);

  useEffect(() => {
    for (const item of items) {
      if (started.current.has(item.id)) continue;
      started.current.add(item.id);
      // A file is "loading" until it has an entry here, so there is no
      // separate loading flag to keep in sync. One bad file only ever
      // fails its own card, never the others.
      getPdfInfo(item.file)
        .then((result) => setResults((current) => ({ ...current, [item.id]: result })))
        .catch(() =>
          setResults((current) => ({
            ...current,
            [item.id]: { ok: false, error: errors.corruptFile() },
          })),
        );
    }
  }, [items]);

  function handleAccepted(files: File[]) {
    setItems((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  function handleRemove(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    setResults((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function clearAll() {
    setItems([]);
    setResults({});
  }

  const okInfos = items.flatMap((item) => {
    const result = results[item.id];
    return result && result.ok ? [result.info] : [];
  });
  const totalPages = okInfos.reduce((sum, info) => sum + info.pageCount, 0);
  const totalBytes = okInfos.reduce((sum, info) => sum + info.fileSizeBytes, 0);

  function downloadCsv() {
    const blob = new Blob([pdfInfosToCsv(okInfos)], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, "pdf-properties.csv");
  }

  return (
    <ToolShell tool={tool}>
      <ToolStep title={items.length > 1 ? "Step 1: Files" : "Step 1: File"}>
        <div className="flex flex-col gap-4">
          <FileDropzone
            accept={tool.accept}
            multiple={tool.multiple}
            maxFiles={tool.maxFiles}
            maxFileSizeMB={tool.maxFileSizeMB}
            currentCount={items.length}
            onAccepted={handleAccepted}
          />
          <FileList
            items={items.map((item) => ({ ...item, thumbnailUrl: previews[item.id] }))}
            onRemove={handleRemove}
            onClearAll={clearAll}
          />
        </div>
      </ToolStep>

      {okInfos.length > 1 && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-foreground">
            {okInfos.length} files · {totalPages} pages · {formatBytes(totalBytes)}
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={downloadCsv}>
            <Download aria-hidden="true" className="h-4 w-4" />
            Download summary (CSV)
          </Button>
        </Card>
      )}

      {items.map((item) => {
        const result = results[item.id];
        return (
          <Card key={item.id}>
            <h2 className="mb-4 break-words text-sm font-semibold text-foreground">{item.file.name}</h2>
            {!result && <ProgressBar progress={null} label="Reading PDF..." />}
            {result && !result.ok && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger bg-danger/10 p-3 text-sm text-danger"
              >
                <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{result.error.message}</p>
              </div>
            )}
            {result && result.ok && <PdfInfoBody info={result.info} />}
          </Card>
        );
      })}
    </ToolShell>
  );
}
