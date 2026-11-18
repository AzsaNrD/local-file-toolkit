import { PDFDocument } from "pdf-lib";
import { basenameOf, loadPdf, savePdfAsOutputFile } from "./load";
import { errors, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type ReplacePagesResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

/**
 * Drops the selected pages from `file` and puts every page of `insertFile`
 * where the first dropped page used to be. Builds a new document and copies
 * pages in final order (same approach as reorder, PRD 8.5) so no page index
 * ever shifts underneath us.
 *
 * With several pages selected, the insert lands at the first one: the
 * remaining selected pages are simply removed.
 */
export async function replacePages(
  file: File,
  insertFile: File,
  pagesToReplace: number[],
): Promise<ReplacePagesResult> {
  const unique = [...new Set(pagesToReplace)].sort((a, b) => a - b);
  if (unique.length === 0) {
    return { ok: false, error: errors.emptySelection() };
  }

  const source = await loadPdf(await file.arrayBuffer());
  if (!source.ok) return { ok: false, error: source.error };
  const insert = await loadPdf(await insertFile.arrayBuffer());
  if (!insert.ok) return { ok: false, error: insert.error };

  const pageCount = source.doc.getPageCount();
  if (unique[unique.length - 1] > pageCount) {
    return { ok: false, error: errors.invalidPageRange(pageCount) };
  }

  const removed = new Set(unique);
  const insertAt = unique[0];
  const out = await PDFDocument.create();

  const keepBefore: number[] = [];
  const keepAfter: number[] = [];
  for (let page = 1; page <= pageCount; page++) {
    if (removed.has(page)) continue;
    (page < insertAt ? keepBefore : keepAfter).push(page - 1);
  }

  const copyInto = async (doc: PDFDocument, indices: number[]) => {
    if (indices.length === 0) return;
    for (const page of await out.copyPages(doc, indices)) out.addPage(page);
  };

  await copyInto(source.doc, keepBefore);
  await copyInto(insert.doc, insert.doc.getPageIndices());
  await copyInto(source.doc, keepAfter);

  const output = await savePdfAsOutputFile(out, `${basenameOf(file.name)}-replaced.pdf`);
  return { ok: true, output };
}
