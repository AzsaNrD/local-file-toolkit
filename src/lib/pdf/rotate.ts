import { degrees } from "pdf-lib";
import { basenameOf, loadPdf, savePdfAsOutputFile } from "./load";
import type { AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type RotateResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

/**
 * PRD 8.4 algorithm: each entry is a 1-indexed page number mapped to its
 * accumulated rotation delta in degrees; rotation is relative to whatever
 * rotation the page already had in the source file, never reset to zero.
 */
export async function rotatePages(
  file: File,
  deltas: Record<number, number>,
): Promise<RotateResult> {
  const bytes = await file.arrayBuffer();
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };

  const { doc } = loaded;
  const pages = doc.getPages();

  for (const [pageNumberText, delta] of Object.entries(deltas)) {
    if (!delta) continue;
    const page = pages[Number(pageNumberText) - 1];
    if (!page) continue;
    const current = page.getRotation().angle;
    const normalised = (((current + delta) % 360) + 360) % 360;
    page.setRotation(degrees(normalised));
  }

  const output = await savePdfAsOutputFile(doc, `${basenameOf(file.name)}-rotated.pdf`);
  return { ok: true, output };
}
