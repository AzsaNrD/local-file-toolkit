import { canvasToBlob } from "./resize";
import { toAppError, type AppError } from "@/lib/errors";
import { splitExtension } from "@/lib/format";
import type { OutputFile } from "@/lib/types";

/** A region in fractions of the image: 0,0 is the top-left corner, 1,1 the bottom-right. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Quarter turns clockwise, 0 to 3. */
export type QuarterTurns = 0 | 1 | 2 | 3;

export type CropImageResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

/** The picture turned by whole quarter turns. EXIF rotation is already applied by the browser when it decodes. */
export function drawTurned(image: CanvasImageSource & { width: number; height: number }, turns: QuarterTurns): HTMLCanvasElement {
  const sideways = turns % 2 === 1;
  const canvas = document.createElement("canvas");
  canvas.width = sideways ? image.height : image.width;
  canvas.height = sideways ? image.width : image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((turns * Math.PI) / 2);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  return canvas;
}

const SAVE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function cropImage(
  file: File,
  turned: HTMLCanvasElement,
  rect: CropRect,
): Promise<CropImageResult> {
  try {
    const sx = Math.max(0, Math.round(rect.x * turned.width));
    const sy = Math.max(0, Math.round(rect.y * turned.height));
    const sw = Math.max(1, Math.min(turned.width - sx, Math.round(rect.w * turned.width)));
    const sh = Math.max(1, Math.min(turned.height - sy, Math.round(rect.h * turned.height)));

    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    const context = out.getContext("2d");
    if (!context) throw new Error("2D canvas context unavailable");
    context.drawImage(turned, sx, sy, sw, sh, 0, 0, sw, sh);

    // Keep the format the photo came in; anything the canvas cannot write goes out as PNG.
    const type = SAVE_TYPES.has(file.type) ? file.type : "image/png";
    const blob = await canvasToBlob(out, type, type === "image/png" ? undefined : 0.92);
    out.width = 0;
    out.height = 0;

    const { base } = splitExtension(file.name);
    const extension = type === "image/jpeg" ? ".jpg" : type === "image/webp" ? ".webp" : ".png";
    return {
      ok: true,
      output: { name: `${base}-cropped${extension}`, blob, sizeBytes: blob.size, mimeType: type },
    };
  } catch (thrown) {
    return { ok: false, error: toAppError(thrown) };
  }
}
