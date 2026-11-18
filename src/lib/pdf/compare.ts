import { PDFDocument } from "pdf-lib";
import { loadPdfForThumbnails } from "./thumbnails";
import { savePdfAsOutputFile } from "./load";
import { canvasToBlob } from "@/lib/image/resize";
import { fromPdfJsError, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type PageVerdict = "same" | "changed" | "size-differs" | "only-original" | "only-revised";

export interface PageComparison {
  page: number;
  verdict: PageVerdict;
  /** Share of the page area that differs, 0 to 1. Only for "changed". */
  changedShare: number;
  /** The revised page with the differing areas outlined in red. Only for "changed". */
  highlight?: Blob;
}

export type CompareResult =
  | { ok: true; pages: PageComparison[]; report: OutputFile | null }
  | { ok: false; error: AppError };

// Render scale: about 108 dpi, enough to see a changed word, light enough to compare long files.
const SCALE = 1.5;
// A pixel differs when any colour channel moves by more than this (of 255). Ignores anti-aliasing noise.
const PIXEL_THRESHOLD = 48;
// The page is cut into squares of this many pixels. A square counts as changed when enough of it differs.
const CELL = 16;
const CELL_CHANGED_SHARE = 0.015;
// Pages whose sizes differ by less than this many points are treated as the same size.
const SIZE_TOLERANCE_PT = 2;

async function renderPage(pdf: Awaited<ReturnType<typeof loadPdfForThumbnails>>, pageNumber: number) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: SCALE });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas context unavailable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  const base = page.getViewport({ scale: 1 });
  page.cleanup();
  return { canvas, context, widthPt: base.width, heightPt: base.height };
}

function release(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Compares two PDFs page by page by looking at what they draw, not at their text, so a moved
 * image or a changed figure shows up as well as an edited sentence. The report is a PDF of
 * the revised pages that changed, each with the changed areas outlined.
 */
export async function comparePdfs(
  original: File,
  revised: File,
  onProgress?: (done: number, total: number) => void,
): Promise<CompareResult> {
  try {
    const [a, b] = await Promise.all([
      loadPdfForThumbnails(await original.arrayBuffer()),
      loadPdfForThumbnails(await revised.arrayBuffer()),
    ]);
    const total = Math.max(a.numPages, b.numPages);
    const pages: PageComparison[] = [];

    for (let pageNumber = 1; pageNumber <= total; pageNumber++) {
      if (pageNumber > a.numPages) {
        pages.push({ page: pageNumber, verdict: "only-revised", changedShare: 1 });
        onProgress?.(pageNumber, total);
        continue;
      }
      if (pageNumber > b.numPages) {
        pages.push({ page: pageNumber, verdict: "only-original", changedShare: 1 });
        onProgress?.(pageNumber, total);
        continue;
      }

      const left = await renderPage(a, pageNumber);
      const right = await renderPage(b, pageNumber);

      if (
        Math.abs(left.widthPt - right.widthPt) > SIZE_TOLERANCE_PT ||
        Math.abs(left.heightPt - right.heightPt) > SIZE_TOLERANCE_PT
      ) {
        pages.push({ page: pageNumber, verdict: "size-differs", changedShare: 1 });
        release(left.canvas);
        release(right.canvas);
        onProgress?.(pageNumber, total);
        continue;
      }

      const width = right.canvas.width;
      const height = right.canvas.height;
      const before = left.context.getImageData(0, 0, Math.min(width, left.canvas.width), Math.min(height, left.canvas.height));
      const after = right.context.getImageData(0, 0, width, height);
      const rowWidth = Math.min(width, before.width);
      const rowCount = Math.min(height, before.height);

      const cols = Math.ceil(width / CELL);
      const rows = Math.ceil(height / CELL);
      const cellHits = new Uint16Array(cols * rows);
      for (let y = 0; y < rowCount; y++) {
        for (let x = 0; x < rowWidth; x++) {
          const i = (y * before.width + x) * 4;
          const j = (y * width + x) * 4;
          if (
            Math.abs(before.data[i] - after.data[j]) > PIXEL_THRESHOLD ||
            Math.abs(before.data[i + 1] - after.data[j + 1]) > PIXEL_THRESHOLD ||
            Math.abs(before.data[i + 2] - after.data[j + 2]) > PIXEL_THRESHOLD
          ) {
            cellHits[Math.floor(y / CELL) * cols + Math.floor(x / CELL)]++;
          }
        }
      }

      let changedCells = 0;
      const minHits = CELL * CELL * CELL_CHANGED_SHARE;
      const context = right.context;
      context.fillStyle = "rgba(255, 40, 90, 0.28)";
      context.strokeStyle = "rgba(255, 40, 90, 0.9)";
      context.lineWidth = 1;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (cellHits[row * cols + col] > minHits) {
            changedCells++;
            context.fillRect(col * CELL, row * CELL, CELL, CELL);
          }
        }
      }

      if (changedCells === 0) {
        pages.push({ page: pageNumber, verdict: "same", changedShare: 0 });
      } else {
        pages.push({
          page: pageNumber,
          verdict: "changed",
          changedShare: changedCells / (cols * rows),
          highlight: await canvasToBlob(right.canvas, "image/jpeg", 0.85),
        });
      }
      release(left.canvas);
      release(right.canvas);
      onProgress?.(pageNumber, total);
    }

    await Promise.all([a.loadingTask.destroy(), b.loadingTask.destroy()]);

    const changed = pages.filter((p) => p.highlight);
    let report: OutputFile | null = null;
    if (changed.length > 0) {
      const doc = await PDFDocument.create();
      for (const entry of changed) {
        const image = await doc.embedJpg(new Uint8Array(await entry.highlight!.arrayBuffer()));
        const page = doc.addPage([image.width / SCALE, image.height / SCALE]);
        page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
      }
      report = await savePdfAsOutputFile(doc, "comparison.pdf");
    }
    return { ok: true, pages, report };
  } catch (thrown) {
    return { ok: false, error: fromPdfJsError(thrown) };
  }
}
