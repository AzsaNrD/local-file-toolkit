import { basenameOf } from "./load";
import { loadPdfForThumbnails } from "./thumbnails";
import { canvasToBlob } from "@/lib/image/resize";
import { toAppError, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type ImageOutputFormat = "png" | "jpeg";
export type Resolution = "low" | "medium" | "high";

export const DPI_BY_RESOLUTION: Record<Resolution, number> = {
  low: 72,
  medium: 150,
  high: 300,
};

export interface PdfToImageOptions {
  format: ImageOutputFormat;
  /** 0.1 to 1.0, format "jpeg" only. */
  quality?: number;
  resolution: Resolution;
}

export type PdfToImageResult =
  | { ok: true; outputs: OutputFile[] }
  | { ok: false; error: AppError };

/** PRD 8.6 algorithm: scale = dpi / 72, render each page sequentially. */
export async function pdfToImages(
  file: File,
  options: PdfToImageOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<PdfToImageResult> {
  try {
    const bytes = await file.arrayBuffer();
    const pdf = await loadPdfForThumbnails(bytes);

    const dpi = DPI_BY_RESOLUTION[options.resolution];
    const scale = dpi / 72;
    const mimeType = options.format === "png" ? "image/png" : "image/jpeg";
    const extension = options.format === "png" ? "png" : "jpg";
    const basename = basenameOf(file.name);
    const outputs: OutputFile[] = [];

    // Sequential, not parallel (PRD 12.7): parallel rendering of a large,
    // high-DPI document can exhaust browser memory.
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D canvas context unavailable");

      await page.render({ canvasContext: context, viewport, canvas }).promise;
      const blob = await canvasToBlob(
        canvas,
        mimeType,
        options.format === "jpeg" ? (options.quality ?? 0.85) : undefined,
      );

      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();

      outputs.push({
        name: `${basename}-page-${pageNumber}.${extension}`,
        blob,
        sizeBytes: blob.size,
        mimeType,
      });
      onProgress?.(pageNumber, pdf.numPages);
    }

    await pdf.loadingTask.destroy();
    return { ok: true, outputs };
  } catch (thrown) {
    return { ok: false, error: toAppError(thrown) };
  }
}
