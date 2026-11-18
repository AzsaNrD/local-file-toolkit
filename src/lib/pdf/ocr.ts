import { StandardFonts } from "pdf-lib";
import { loadPdf, basenameOf, savePdfAsOutputFile } from "./load";
import { errors, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";
import type Tesseract from "tesseract.js";
import type { PDFPageProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";

/** A page with only a stray character or two (a stamp, a page number) still counts as "no real text". */
const EXISTING_TEXT_THRESHOLD = 20;

export type OcrLanguage = "eng" | "ind" | "eng+ind";

export interface OcrOptions {
  language: OcrLanguage;
}

export type OcrResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

/** Rendered this high (in DPI-equivalent scale) for OCR accuracy; thumbnails use ~72-160. */
const RENDER_SCALE = 200 / 72;
const MIN_CONFIDENCE = 35;

interface RecognizedWord {
  text: string;
  /** Pixel-space box in the rendered canvas: y grows downward, origin top-left. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * tesseract.js's own lazy per-job language loading has no timeout of its
 * own: a failed fetch for the trained-data file (as opposed to a failed
 * fetch during the worker's initial startup, which does reject normally)
 * leaves `recognize()` neither resolving nor rejecting, forever. Every call
 * into the worker is wrapped in this so a stuck job surfaces as a normal
 * error instead of an infinite spinner.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (thrown) => {
        clearTimeout(timer);
        reject(thrown);
      },
    );
  });
}

/** True once a pdf.js page's own text layer already has enough real content to skip OCR. */
async function hasExistingText(page: PDFPageProxy): Promise<boolean> {
  const content = await page.getTextContent();
  const totalLength = content.items
    .filter((item): item is TextItem => "str" in item)
    .reduce((sum, item) => sum + item.str.trim().length, 0);
  return totalLength > EXISTING_TEXT_THRESHOLD;
}

function flattenWords(page: Tesseract.Page): RecognizedWord[] {
  const words: RecognizedWord[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          if (word.confidence < MIN_CONFIDENCE) continue;
          const text = word.text.trim();
          if (!text) continue;
          words.push({ text, x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1 });
        }
      }
    }
  }
  return words;
}

/**
 * Not in the original 11 tools: makes a scanned PDF (pages with no text
 * layer) searchable and selectable, by recognizing each page's text with
 * Tesseract.js and stamping it back onto the page as an invisible
 * (opacity 0) layer at the recognized position. The visible page is never
 * touched, only a text layer is added underneath what you already see.
 */
export async function ocrPdf(
  file: File,
  options: OcrOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<OcrResult> {
  const bytes = await file.arrayBuffer();
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { doc } = loaded;
  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Dynamic imports, not top-level ones (PRD 12.1.4): pdfjs-dist and
  // tesseract.js must never be evaluated during SSR, only in the browser.
  const { loadPdfForThumbnails } = await import("./thumbnails");
  const { createWorker } = await import("tesseract.js");

  const pdf = await loadPdfForThumbnails(bytes);

  // tesseract.js's own default behaviour, with no errorHandler given, is to
  // `throw` a raw, uncaught error from inside a worker message callback (not
  // a rejected promise) on top of whatever it also does through the normal
  // promise chain below. That throw happens outside any try/catch this
  // function can wrap, so it always needs an errorHandler, even a no-op
  // one, or a real failure here (a blocked fetch, a missing file) crashes
  // the whole page instead of surfacing as this tool's normal error state.
  let worker: Tesseract.Worker;
  try {
    worker = await withTimeout(
      createWorker(options.language, undefined, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract/tesseract-core-lstm.wasm.js",
        langPath: "/tesseract/lang-data",
        errorHandler: () => {},
      }),
      45_000,
    );
  } catch {
    return { ok: false, error: errors.timeout("the OCR engine could not be started in time") };
  }

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const pdfPage = pages[pageNumber - 1];
      const { height: pageHeightPt } = pdfPage.getSize();

      const page = await pdf.getPage(pageNumber);

      // A page that already has a real text layer (not from a scan, or
      // already OCR'd before) is left untouched: re-running OCR on top of
      // it would stack a second, invisible text layer over the real one,
      // which can make selecting or copying text return duplicated text.
      if (await hasExistingText(page)) {
        page.cleanup();
        onProgress?.(pageNumber, pdf.numPages);
        continue;
      }

      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D canvas context unavailable");
      await page.render({ canvasContext: context, viewport, canvas }).promise;

      const { data } = await withTimeout(worker.recognize(canvas, {}, { blocks: true }), 60_000);
      const words = flattenWords(data);

      for (const word of words) {
        const widthPt = (word.x1 - word.x0) / RENDER_SCALE;
        const heightPt = (word.y1 - word.y0) / RENDER_SCALE;
        if (widthPt <= 0 || heightPt <= 0) continue;

        const x = word.x0 / RENDER_SCALE;
        const y = pageHeightPt - word.y1 / RENDER_SCALE;

        // Font size is picked so the invisible text's own rendered width
        // matches the word's real width, since that (not the height) is
        // what makes text selection line up with what you see on screen.
        const naturalWidth = font.widthOfTextAtSize(word.text, heightPt);
        const fontSize = naturalWidth > 0 ? heightPt * (widthPt / naturalWidth) : heightPt;

        try {
          pdfPage.drawText(word.text, { x, y, size: fontSize, font, opacity: 0 });
        } catch {
          // A handful of recognized words can contain characters outside
          // Helvetica's WinAnsi encoding; skipping just that word keeps the
          // rest of the page's OCR layer intact instead of failing the job.
        }
      }

      page.cleanup();
      onProgress?.(pageNumber, pdf.numPages);
    }
  } catch {
    return { ok: false, error: errors.timeout("text recognition did not finish for one of the pages") };
  } finally {
    await worker.terminate();
  }

  const output = await savePdfAsOutputFile(doc, `${basenameOf(file.name)}-ocr.pdf`);
  return { ok: true, output };
}
