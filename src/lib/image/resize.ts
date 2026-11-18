import { toAppError, type AppError } from "@/lib/errors";
import { splitExtension } from "@/lib/format";
import type { OutputFile } from "@/lib/types";

export type ResizeMode = "dimensions" | "percentage" | "fit";

export interface ResizeOptions {
  mode: ResizeMode;
  /** mode "dimensions": the final pixel size (aspect-ratio locking is a UI concern). */
  width?: number;
  height?: number;
  /** mode "percentage": 10 to 200. */
  percentage?: number;
  /** mode "fit": the box to fit inside, scaling down only, never up. */
  maxWidth?: number;
  maxHeight?: number;
}

export type ResizeResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

/** PRD 12.8: canvas.toBlob takes a callback, not a return value. Wrap once, reuse everywhere. */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type?: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas could not be exported"))),
      type,
      quality,
    );
  });
}

function computeTargetSize(
  originalWidth: number,
  originalHeight: number,
  options: ResizeOptions,
): { width: number; height: number } {
  if (options.mode === "percentage") {
    const pct = (options.percentage ?? 100) / 100;
    return {
      width: Math.max(1, Math.round(originalWidth * pct)),
      height: Math.max(1, Math.round(originalHeight * pct)),
    };
  }
  if (options.mode === "fit") {
    const maxWidth = options.maxWidth ?? originalWidth;
    const maxHeight = options.maxHeight ?? originalHeight;
    const scale = Math.min(1, maxWidth / originalWidth, maxHeight / originalHeight);
    return {
      width: Math.max(1, Math.round(originalWidth * scale)),
      height: Math.max(1, Math.round(originalHeight * scale)),
    };
  }
  // mode === "dimensions": the UI already resolved both values (lock-aspect
  // math happens there), this just falls back to the original size.
  return {
    width: Math.max(1, Math.round(options.width ?? originalWidth)),
    height: Math.max(1, Math.round(options.height ?? originalHeight)),
  };
}

/**
 * PRD 8.9: downscaling more than 2x in one draw looks visibly aliased, so
 * large reductions happen in successive halving steps before the final draw.
 */
function drawResized(
  source: ImageBitmap,
  targetWidth: number,
  targetHeight: number,
): HTMLCanvasElement {
  let currentWidth = source.width;
  let currentHeight = source.height;
  let currentSource: CanvasImageSource = source;

  while (currentWidth / targetWidth > 2 || currentHeight / targetHeight > 2) {
    const nextWidth = Math.max(targetWidth, Math.round(currentWidth / 2));
    const nextHeight = Math.max(targetHeight, Math.round(currentHeight / 2));
    const step = document.createElement("canvas");
    step.width = nextWidth;
    step.height = nextHeight;
    const stepContext = step.getContext("2d");
    if (!stepContext) throw new Error("2D canvas context unavailable");
    stepContext.imageSmoothingQuality = "high";
    stepContext.drawImage(currentSource, 0, 0, nextWidth, nextHeight);
    currentSource = step;
    currentWidth = nextWidth;
    currentHeight = nextHeight;
  }

  const final = document.createElement("canvas");
  final.width = targetWidth;
  final.height = targetHeight;
  const finalContext = final.getContext("2d");
  if (!finalContext) throw new Error("2D canvas context unavailable");
  finalContext.imageSmoothingQuality = "high";
  finalContext.drawImage(currentSource, 0, 0, targetWidth, targetHeight);
  return final;
}

export async function resizeImage(file: File, options: ResizeOptions): Promise<ResizeResult> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = computeTargetSize(bitmap.width, bitmap.height, options);
    const canvas = drawResized(bitmap, width, height);
    bitmap.close();

    const mimeType = file.type || "image/png";
    const blob = await canvasToBlob(canvas, mimeType);
    const { base, ext } = splitExtension(file.name);

    return {
      ok: true,
      output: {
        name: `${base}-${width}x${height}${ext}`,
        blob,
        sizeBytes: blob.size,
        mimeType,
      },
    };
  } catch (thrown) {
    return { ok: false, error: toAppError(thrown) };
  }
}
