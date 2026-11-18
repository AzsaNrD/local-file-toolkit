import { rgb, StandardFonts } from "pdf-lib";
import { basenameOf, loadPdf, savePdfAsOutputFile } from "./load";
import { hexToRgbUnit, resolveAnchor, type PageAnchorPosition } from "./layout";
import { errors, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export interface PageNumberOptions {
  position: PageAnchorPosition;
  fontSize: number;
  /** "#rrggbb". */
  color: string;
  /** "{n}" becomes the page number, "{total}" the page count, e.g. "Page {n} of {total}". */
  format: string;
  startAt: number;
  skipFirstPage: boolean;
}

export type PageNumberResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

/** Not in the original 11 tools: stamps a running page number onto every page (or every page but the first). */
export async function addPageNumbers(file: File, options: PageNumberOptions): Promise<PageNumberResult> {
  if (!options.format.includes("{n}")) {
    return { ok: false, error: errors.emptySelection("the format needs a {n} placeholder") };
  }

  const bytes = await file.arrayBuffer();
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { doc } = loaded;

  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const { r, g, b } = hexToRgbUnit(options.color);

  pages.forEach((page, index) => {
    if (options.skipFirstPage && index === 0) return;
    const displayIndex = options.skipFirstPage ? index - 1 : index;
    const pageNumber = options.startAt + displayIndex;
    const text = options.format
      .replace("{n}", String(pageNumber))
      .replace("{total}", String(pages.length));

    const { width: pageWidth, height: pageHeight } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, options.fontSize);
    const textHeight = font.heightAtSize(options.fontSize);
    const { x, y } = resolveAnchor(options.position, pageWidth, pageHeight, textWidth, textHeight);

    page.drawText(text, { x, y, size: options.fontSize, font, color: rgb(r, g, b) });
  });

  const output = await savePdfAsOutputFile(doc, `${basenameOf(file.name)}-numbered.pdf`);
  return { ok: true, output };
}
