import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

// PRD 12.1: the worker file is copied into public/ by scripts/copy-pdf-worker.mjs.
// Must be set before any other pdf.js call, and this module is only ever
// imported from "use client" tool pages (PRD 12.1.4).
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export async function loadPdfForThumbnails(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  return loadingTask.promise;
}

/** Renders one page to a small PNG data URL for use as a thumbnail `<img src>`. */
export async function renderThumbnail(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  maxWidth = 160,
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = maxWidth / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable");

  const renderTask = page.render({ canvasContext: context, viewport, canvas });
  await renderTask.promise;
  const dataUrl = canvas.toDataURL("image/png");

  // PRD 12.7: release each canvas before moving to the next page.
  canvas.width = 0;
  canvas.height = 0;
  page.cleanup();

  return dataUrl;
}

/**
 * Renders every page sequentially (PRD 12.7 forbids parallel rendering: it
 * can exhaust browser memory on large documents at high DPI).
 */
export async function renderAllThumbnails(
  pdf: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void,
  maxWidth = 160,
): Promise<string[]> {
  const thumbnails: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    thumbnails.push(await renderThumbnail(pdf, pageNumber, maxWidth));
    onProgress?.(pageNumber, pdf.numPages);
  }
  return thumbnails;
}
