import { degrees, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { basenameOf, loadPdf, savePdfAsOutputFile } from "./load";
import { hexToRgbUnit, resolveAnchor, type PageAnchorPosition } from "./layout";
import { errors, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type WatermarkPosition = PageAnchorPosition;

interface WatermarkCommon {
  position: WatermarkPosition;
  /** 0 (invisible) to 1 (opaque). */
  opacity: number;
  rotationDegrees: number;
}

export interface TextWatermarkOptions extends WatermarkCommon {
  mode: "text";
  text: string;
  fontSize: number;
  /** "#rrggbb". */
  color: string;
}

export interface ImageWatermarkOptions extends WatermarkCommon {
  mode: "image";
  imageBytes: ArrayBuffer;
  imageMimeType: string;
  /** Rendered width as a percentage of the page's own width. */
  widthPercent: number;
}

export type WatermarkOptions = TextWatermarkOptions | ImageWatermarkOptions;

export type WatermarkResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

function drawTextWatermark(page: PDFPage, font: PDFFont, options: TextWatermarkOptions): void {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);
  const textHeight = font.heightAtSize(options.fontSize);
  const { x, y } = resolveAnchor(options.position, pageWidth, pageHeight, textWidth, textHeight);
  const { r, g, b } = hexToRgbUnit(options.color);

  page.drawText(options.text, {
    x,
    y,
    size: options.fontSize,
    font,
    color: rgb(r, g, b),
    opacity: options.opacity,
    rotate: degrees(options.rotationDegrees),
  });
}

function drawImageWatermark(page: PDFPage, image: PDFImage, options: ImageWatermarkOptions): void {
  const { width: pageWidth, height: pageHeight } = page.getSize();
  const drawWidth = pageWidth * (options.widthPercent / 100);
  const drawHeight = drawWidth * (image.height / image.width);
  const { x, y } = resolveAnchor(options.position, pageWidth, pageHeight, drawWidth, drawHeight);

  page.drawImage(image, {
    x,
    y,
    width: drawWidth,
    height: drawHeight,
    opacity: options.opacity,
    rotate: degrees(options.rotationDegrees),
  });
}

/** PRD-style extension (not in the original 11 tools): stamps text or an image onto every page. */
export async function addWatermark(file: File, options: WatermarkOptions): Promise<WatermarkResult> {
  const bytes = await file.arrayBuffer();
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { doc } = loaded;

  if (options.mode === "text") {
    if (!options.text.trim()) return { ok: false, error: errors.emptySelection("empty watermark text") };
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    for (const page of doc.getPages()) drawTextWatermark(page, font, options);
  } else {
    const image =
      options.imageMimeType === "image/png"
        ? await doc.embedPng(options.imageBytes)
        : await doc.embedJpg(options.imageBytes);
    for (const page of doc.getPages()) drawImageWatermark(page, image, options);
  }

  const output = await savePdfAsOutputFile(doc, `${basenameOf(file.name)}-watermarked.pdf`);
  return { ok: true, output };
}
