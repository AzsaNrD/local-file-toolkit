import { degrees, type PDFImage, type PDFPage } from "pdf-lib";
import { basenameOf, loadPdf, savePdfAsOutputFile } from "./load";
import { errors, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type SignTarget =
  | { kind: "all" }
  | { kind: "last" }
  | { kind: "first" }
  /** 1-based page number. */
  | { kind: "page"; pageNumber: number };

export interface SignOptions {
  imageBytes: ArrayBuffer;
  imageMimeType: "image/png" | "image/jpeg";
  target: SignTarget;
  /** Center of the signature as a fraction of the page as it is displayed, measured from the top-left. */
  centerX: number;
  centerY: number;
  /** Signature width as a fraction of the displayed page width. */
  widthFraction: number;
}

export type SignResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Draws the image so it appears upright at the chosen spot on the page as the
 * viewer shows it. A page with a /Rotate flag is displayed turned, so the
 * display-space point is mapped back into the page's own coordinates and the
 * image is counter-rotated to match.
 */
function placeSignature(page: PDFPage, image: PDFImage, options: SignOptions): void {
  const box = page.getMediaBox();
  const quarterTurns = Math.round((((page.getRotation().angle % 360) + 360) % 360) / 90) % 4;
  const sideways = quarterTurns % 2 === 1;
  const displayWidth = sideways ? box.height : box.width;
  const displayHeight = sideways ? box.width : box.height;

  const drawWidth = displayWidth * options.widthFraction;
  const drawHeight = drawWidth * (image.height / image.width);

  // Keep the whole signature on the page even if the saved position sits near an edge.
  const centerX = clamp(
    options.centerX,
    drawWidth / 2 / displayWidth,
    1 - drawWidth / 2 / displayWidth,
  );
  const centerY = clamp(
    options.centerY,
    drawHeight / 2 / displayHeight,
    1 - drawHeight / 2 / displayHeight,
  );
  const u = centerX * displayWidth;
  const v = centerY * displayHeight;

  let x: number;
  let y: number;
  switch (quarterTurns) {
    case 1:
      x = v;
      y = u;
      break;
    case 2:
      x = box.width - u;
      y = v;
      break;
    case 3:
      x = box.width - v;
      y = box.height - u;
      break;
    default:
      x = u;
      y = box.height - v;
  }

  const theta = (quarterTurns * Math.PI) / 2;
  const halfWidth = drawWidth / 2;
  const halfHeight = drawHeight / 2;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  // pdf-lib rotates about the image's lower-left corner, so start from the center and step back to it.
  const lowerLeftX = x - (halfWidth * cos - halfHeight * sin);
  const lowerLeftY = y - (halfWidth * sin + halfHeight * cos);

  page.drawImage(image, {
    x: box.x + lowerLeftX,
    y: box.y + lowerLeftY,
    width: drawWidth,
    height: drawHeight,
    rotate: degrees(quarterTurns * 90),
  });
}

/** Not in the PRD: places a picture of a signature on one or all pages. A visual mark, not a cryptographic signature. */
export async function signPdf(file: File, options: SignOptions): Promise<SignResult> {
  const loaded = await loadPdf(await file.arrayBuffer());
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { doc } = loaded;

  const pageCount = doc.getPageCount();
  let pageIndexes: number[];
  switch (options.target.kind) {
    case "all":
      pageIndexes = Array.from({ length: pageCount }, (_, index) => index);
      break;
    case "first":
      pageIndexes = [0];
      break;
    case "last":
      pageIndexes = [pageCount - 1];
      break;
    case "page":
      if (options.target.pageNumber < 1 || options.target.pageNumber > pageCount) {
        return { ok: false, error: errors.invalidPageRange(pageCount) };
      }
      pageIndexes = [options.target.pageNumber - 1];
      break;
  }

  let image: PDFImage;
  try {
    image =
      options.imageMimeType === "image/png"
        ? await doc.embedPng(options.imageBytes)
        : await doc.embedJpg(options.imageBytes);
  } catch (thrown) {
    return {
      ok: false,
      error: errors.corruptFile(thrown instanceof Error ? thrown.message : String(thrown)),
    };
  }

  for (const index of pageIndexes) placeSignature(doc.getPage(index), image, options);

  const output = await savePdfAsOutputFile(doc, `${basenameOf(file.name)}-signed.pdf`);
  return { ok: true, output };
}
