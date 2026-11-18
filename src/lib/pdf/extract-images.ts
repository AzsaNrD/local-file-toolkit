import { ImageKind, OPS } from "pdfjs-dist";
import { loadPdfForThumbnails } from "./thumbnails";
import { canvasToBlob } from "@/lib/image/resize";
import { fromPdfJsError, type AppError } from "@/lib/errors";

export interface ExtractedImage {
  id: string;
  /** 1-based page the picture was found on. */
  page: number;
  width: number;
  height: number;
  /** Lossless PNG of the picture as the PDF draws it. */
  blob: Blob;
}

export type ExtractImagesResult =
  | { ok: true; images: ExtractedImage[]; truncated: boolean }
  | { ok: false; error: AppError };

// A scan or a catalogue can hold thousands of pictures; past this the browser tab is at risk.
const MAX_IMAGES = 300;

interface PdfJsImage {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8Array | Uint8ClampedArray;
  bitmap?: ImageBitmap;
}

function toCanvas(image: PdfJsImage): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  if (image.bitmap) {
    context.drawImage(image.bitmap, 0, 0);
    return canvas;
  }
  if (!image.data) return null;

  const rgba = context.createImageData(image.width, image.height);
  const out = rgba.data;
  const src = image.data;
  if (image.kind === ImageKind.RGBA_32BPP) {
    out.set(src.subarray(0, out.length));
  } else if (image.kind === ImageKind.RGB_24BPP) {
    for (let i = 0, j = 0; i < out.length; i += 4, j += 3) {
      out[i] = src[j];
      out[i + 1] = src[j + 1];
      out[i + 2] = src[j + 2];
      out[i + 3] = 255;
    }
  } else if (image.kind === ImageKind.GRAYSCALE_1BPP) {
    // Rows are packed eight pixels to a byte and padded to a whole byte.
    const rowBytes = Math.ceil(image.width / 8);
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const bit = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const o = (y * image.width + x) * 4;
        out[o] = out[o + 1] = out[o + 2] = bit ? 255 : 0;
        out[o + 3] = 255;
      }
    }
  } else {
    return null;
  }
  context.putImageData(rgba, 0, 0);
  return canvas;
}

/**
 * Finds every picture a PDF draws, by reading the page drawing instructions rather than the
 * raw file, so pictures stored in any encoding come out as ordinary images. Stencil masks
 * (used for scanned text and shapes) are skipped: they are not pictures.
 */
export async function extractPdfImages(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractImagesResult> {
  try {
    const pdf = await loadPdfForThumbnails(await file.arrayBuffer());
    const images: ExtractedImage[] = [];
    const seen = new Set<string>();
    let truncated = false;

    for (let pageNumber = 1; pageNumber <= pdf.numPages && !truncated; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const list = await page.getOperatorList();
      let indexOnPage = 0;

      for (let i = 0; i < list.fnArray.length; i++) {
        const op = list.fnArray[i];
        let image: PdfJsImage | null = null;
        let key: string | null = null;

        if (op === OPS.paintImageXObject) {
          const name = list.argsArray[i][0] as string;
          // Shared pictures live in a document-wide table, and keep one name across pages.
          const store = name.startsWith("g_") ? page.commonObjs : page.objs;
          if (!store.has(name)) continue;
          if (name.startsWith("g_")) {
            if (seen.has(name)) continue;
            seen.add(name);
          }
          image = store.get(name) as PdfJsImage;
          key = name;
        } else if (op === OPS.paintInlineImageXObject) {
          image = list.argsArray[i][0] as PdfJsImage;
          key = `inline-${i}`;
        }
        if (!image || !key || !image.width || !image.height) continue;

        const canvas = toCanvas(image);
        if (!canvas) continue;
        const blob = await canvasToBlob(canvas, "image/png");
        canvas.width = 0;
        canvas.height = 0;

        indexOnPage++;
        images.push({
          id: `${pageNumber}-${indexOnPage}-${key}`,
          page: pageNumber,
          width: image.width,
          height: image.height,
          blob,
        });
        if (images.length >= MAX_IMAGES) {
          truncated = true;
          break;
        }
      }

      page.cleanup();
      onProgress?.(pageNumber, pdf.numPages);
    }

    await pdf.loadingTask.destroy();
    return { ok: true, images, truncated };
  } catch (thrown) {
    return { ok: false, error: fromPdfJsError(thrown) };
  }
}
