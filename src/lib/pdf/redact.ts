import { PDFDocument } from "pdf-lib";
import { basenameOf, loadPdf, savePdfAsOutputFile } from "./load";
import { canvasToBlob } from "@/lib/image/resize";
import { errors, fromPdfJsError, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

/** A box in fractions of the page as it is displayed: 0,0 is the top-left corner, 1,1 the bottom-right. */
export interface RedactBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RedactOptions {
  /** Render resolution of the pages that carry redactions. */
  dpi: number;
}

export type RedactResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

/**
 * Pages with a box are replaced by a picture of themselves with the box painted in black,
 * so the covered text is not in the file any more. Painting a rectangle over live text
 * would leave the words underneath, ready to be selected and copied. Pages without a box
 * are copied across untouched and stay searchable.
 */
export async function redactPdf(
  file: File,
  boxesByPage: Record<number, RedactBox[]>,
  options: RedactOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<RedactResult> {
  const targets = Object.keys(boxesByPage)
    .map(Number)
    .filter((page) => boxesByPage[page].length > 0)
    .sort((a, b) => a - b);
  if (targets.length === 0) return { ok: false, error: errors.emptySelection("no redaction boxes") };

  try {
    const bytes = await file.arrayBuffer();
    const loaded = await loadPdf(bytes.slice(0));
    if (!loaded.ok) return { ok: false, error: loaded.error };
    const source = loaded.doc;

    const { loadPdfForThumbnails } = await import("./thumbnails");
    const pdf = await loadPdfForThumbnails(bytes.slice(0));

    const result = await PDFDocument.create();
    const scale = options.dpi / 72;
    let done = 0;

    for (let pageNumber = 1; pageNumber <= source.getPageCount(); pageNumber++) {
      const boxes = boxesByPage[pageNumber] ?? [];
      if (boxes.length === 0) {
        const [copied] = await result.copyPages(source, [pageNumber - 1]);
        result.addPage(copied);
        continue;
      }

      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D canvas context unavailable");

      // pdf.js leaves transparent pixels where a page paints nothing; JPEG would turn those black.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;

      context.fillStyle = "#000000";
      for (const box of boxes) {
        context.fillRect(
          Math.floor(box.x * canvas.width),
          Math.floor(box.y * canvas.height),
          Math.ceil(box.w * canvas.width) + 1,
          Math.ceil(box.h * canvas.height) + 1,
        );
      }

      const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.92);
      const widthPt = viewport.width / scale;
      const heightPt = viewport.height / scale;
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      const image = await result.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
      const outPage = result.addPage([widthPt, heightPt]);
      outPage.drawImage(image, { x: 0, y: 0, width: widthPt, height: heightPt });

      done++;
      onProgress?.(done, targets.length);
    }

    await pdf.loadingTask.destroy();
    const output = await savePdfAsOutputFile(result, `${basenameOf(file.name)}-redacted.pdf`);
    return { ok: true, output };
  } catch (thrown) {
    return { ok: false, error: fromPdfJsError(thrown) };
  }
}
