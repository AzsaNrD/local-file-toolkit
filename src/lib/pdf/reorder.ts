import { PDFDocument } from "pdf-lib";
import { basenameOf, loadPdf, savePdfAsOutputFile } from "./load";
import type { AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type ReorderResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

/**
 * PRD 8.5 algorithm: build the target index array from the UI order, copy
 * pages into a fresh document in that order. Never mutate the source doc.
 */
export async function reorderPages(file: File, order: number[]): Promise<ReorderResult> {
  const bytes = await file.arrayBuffer();
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const targetIndices = order.map((pageNumber) => pageNumber - 1);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(loaded.doc, targetIndices);
  for (const page of pages) out.addPage(page);

  const output = await savePdfAsOutputFile(out, `${basenameOf(file.name)}-reordered.pdf`);
  return { ok: true, output };
}
