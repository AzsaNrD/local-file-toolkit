import { PDFDocument } from "pdf-lib";
import { loadPdf, savePdfAsOutputFile } from "./load";
import { errors, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type MergeResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

/** PRD 8.1 algorithm: load each input, copy its pages in list order, save. */
export async function mergePdfs(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<MergeResult> {
  if (files.length < 2) {
    return { ok: false, error: errors.emptySelection("need at least two files to merge") };
  }

  const out = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const bytes = await files[i].arrayBuffer();
    const loaded = await loadPdf(bytes);
    if (!loaded.ok) return { ok: false, error: loaded.error };

    const pages = await out.copyPages(loaded.doc, loaded.doc.getPageIndices());
    for (const page of pages) out.addPage(page);
    onProgress?.(i + 1, files.length);
  }

  return { ok: true, output: await savePdfAsOutputFile(out, "merged.pdf") };
}
