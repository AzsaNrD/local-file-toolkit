import { PDFDocument } from "pdf-lib";
import { basenameOf, loadPdf, savePdfAsOutputFile } from "./load";
import { errors, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type SplitMode = "range" | "single-pages" | "every-n";

export interface SplitOptions {
  mode: SplitMode;
  /** 1-indexed pages, already parsed by parsePageRange. Used for "range" when rangeGroups is absent. */
  range?: number[];
  /** The raw range string, for the output filename. Used for "range" when rangeGroups is absent. */
  rangeLabel?: string;
  /**
   * mode "range" only: one output PDF per comma-separated group instead of
   * merging them all into one (e.g. "1,7-10,20-21" becomes 3 files instead
   * of 1). Takes precedence over `range`/`rangeLabel` when present.
   */
  rangeGroups?: { label: string; pages: number[] }[];
  /** Required for "every-n". */
  everyN?: number;
}

export type SplitResult =
  | { ok: true; outputs: OutputFile[] }
  | { ok: false; error: AppError };

async function extractPages(
  source: PDFDocument,
  pageIndices: number[],
  name: string,
): Promise<OutputFile> {
  const out = await PDFDocument.create();
  const pages = await out.copyPages(source, pageIndices);
  for (const page of pages) out.addPage(page);
  return savePdfAsOutputFile(out, name);
}

/** PRD 8.2: three split modes sharing one source document. */
export async function splitPdf(
  file: File,
  options: SplitOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<SplitResult> {
  const bytes = await file.arrayBuffer();
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const { doc } = loaded;
  const pageCount = doc.getPageCount();
  const basename = basenameOf(file.name);

  if (options.mode === "range") {
    if (options.rangeGroups && options.rangeGroups.length > 0) {
      const outputs: OutputFile[] = [];
      for (let i = 0; i < options.rangeGroups.length; i++) {
        const group = options.rangeGroups[i];
        const indices = group.pages.map((n) => n - 1);
        outputs.push(await extractPages(doc, indices, `${basename}-pages-${group.label}.pdf`));
        onProgress?.(i + 1, options.rangeGroups.length);
      }
      return { ok: true, outputs };
    }

    if (!options.range || options.range.length === 0) {
      return { ok: false, error: errors.emptySelection() };
    }
    const indices = options.range.map((n) => n - 1);
    const output = await extractPages(
      doc,
      indices,
      `${basename}-pages-${options.rangeLabel ?? options.range.join("_")}.pdf`,
    );
    onProgress?.(1, 1);
    return { ok: true, outputs: [output] };
  }

  if (options.mode === "single-pages") {
    const outputs: OutputFile[] = [];
    for (let page = 1; page <= pageCount; page++) {
      outputs.push(await extractPages(doc, [page - 1], `${basename}-page-${page}.pdf`));
      onProgress?.(page, pageCount);
    }
    return { ok: true, outputs };
  }

  // mode === "every-n"
  const n = options.everyN ?? 1;
  if (n < 1) {
    return { ok: false, error: errors.invalidPageRange(pageCount, "every-N must be at least 1") };
  }
  const totalParts = Math.ceil(pageCount / n);
  const outputs: OutputFile[] = [];
  for (let part = 0; part < totalParts; part++) {
    const start = part * n;
    const end = Math.min(start + n, pageCount);
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    outputs.push(await extractPages(doc, indices, `${basename}-part-${part + 1}.pdf`));
    onProgress?.(part + 1, totalParts);
  }
  return { ok: true, outputs };
}
