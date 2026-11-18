import { basenameOf, loadPdf, savePdfAsOutputFile } from "./load";
import { errors, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type RemovePagesResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

/**
 * PRD 8.3 algorithm: remove in descending index order so earlier removals
 * don't shift the indices of pages still to be removed.
 */
export async function removePages(file: File, pagesToRemove: number[]): Promise<RemovePagesResult> {
  const bytes = await file.arrayBuffer();
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const { doc } = loaded;
  const pageCount = doc.getPageCount();
  const unique = [...new Set(pagesToRemove)];

  if (unique.length === 0) {
    return { ok: false, error: errors.emptySelection() };
  }
  if (unique.length >= pageCount) {
    return { ok: false, error: errors.emptySelection("this would remove every page") };
  }

  for (const pageNumber of unique.sort((a, b) => b - a)) {
    doc.removePage(pageNumber - 1);
  }

  const output = await savePdfAsOutputFile(doc, `${basenameOf(file.name)}-edited.pdf`);
  return { ok: true, output };
}
