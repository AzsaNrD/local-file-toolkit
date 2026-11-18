import { PDFDocument, type PDFImage } from "pdf-lib";
import { savePdfAsOutputFile } from "./load";
import { errors, toAppError, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type PageSizeMode = "fit" | "a4" | "letter";
export type Orientation = "portrait" | "landscape" | "auto";

export interface ImageToPdfOptions {
  pageSize: PageSizeMode;
  /** Ignored when pageSize === "fit" (PRD 8.7). */
  orientation: Orientation;
  /** 0 to 50. */
  marginMM: number;
}

export type ImageToPdfResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

const MM_TO_PT = 72 / 25.4;
const PAGE_SIZES_PT: Record<Exclude<PageSizeMode, "fit">, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

/**
 * PRD 8.7: embedJpg and embedPng are different methods; calling the wrong
 * one throws a confusing parse error. Detect by MIME type, and fall back to
 * the file's own magic bytes when the MIME type is empty.
 */
async function embedImage(doc: PDFDocument, file: File): Promise<PDFImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPng = file.type === "image/png" || (bytes[0] === 0x89 && bytes[1] === 0x50);
  const isJpeg = file.type === "image/jpeg" || (bytes[0] === 0xff && bytes[1] === 0xd8);

  if (isPng) return doc.embedPng(bytes);
  if (isJpeg) return doc.embedJpg(bytes);
  throw new Error(`"${file.name}" is not a JPEG or PNG image pdf-lib can embed.`);
}

export async function imagesToPdf(
  files: File[],
  options: ImageToPdfOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<ImageToPdfResult> {
  if (files.length === 0) {
    return { ok: false, error: errors.emptySelection("no images selected") };
  }

  try {
    const doc = await PDFDocument.create();
    const marginPt = options.marginMM * MM_TO_PT;

    for (let i = 0; i < files.length; i++) {
      const image = await embedImage(doc, files[i]);

      if (options.pageSize === "fit") {
        const page = doc.addPage([image.width, image.height]);
        page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      } else {
        let [pageWidth, pageHeight] = PAGE_SIZES_PT[options.pageSize];
        const orientation =
          options.orientation === "auto"
            ? image.width > image.height
              ? "landscape"
              : "portrait"
            : options.orientation;
        if (orientation === "landscape") [pageWidth, pageHeight] = [pageHeight, pageWidth];

        const page = doc.addPage([pageWidth, pageHeight]);
        const scaled = image.scaleToFit(pageWidth - 2 * marginPt, pageHeight - 2 * marginPt);
        page.drawImage(image, {
          x: (pageWidth - scaled.width) / 2,
          y: (pageHeight - scaled.height) / 2,
          width: scaled.width,
          height: scaled.height,
        });
      }

      onProgress?.(i + 1, files.length);
    }

    return { ok: true, output: await savePdfAsOutputFile(doc, "images.pdf") };
  } catch (thrown) {
    return { ok: false, error: toAppError(thrown) };
  }
}
