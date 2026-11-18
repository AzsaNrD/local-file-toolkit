import { toAppError, type AppError } from "@/lib/errors";
import { splitExtension } from "@/lib/format";
import { canvasToBlob } from "./resize";
import type { OutputFile } from "@/lib/types";

export type ImageFormat = "image/jpeg" | "image/png" | "image/webp";

const EXTENSION_BY_FORMAT: Record<ImageFormat, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export interface ConvertOptions {
  targetFormat: ImageFormat;
  /** 0.1 to 1.0, used for jpeg and webp targets only. */
  quality?: number;
  /** Fill colour for transparent areas when the target has no alpha channel (JPEG). Default white. */
  backgroundColor?: string;
}

export type ConvertResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

export async function convertImage(file: File, options: ConvertOptions): Promise<ConvertResult> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas context unavailable");

    // A MUST, not a nicety (PRD 8.10): JPEG has no alpha channel, so a
    // transparent PNG/WebP converted without this fill renders black.
    if (options.targetFormat === "image/jpeg") {
      context.fillStyle = options.backgroundColor ?? "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const quality =
      options.targetFormat === "image/png" ? undefined : (options.quality ?? 0.85);
    const blob = await canvasToBlob(canvas, options.targetFormat, quality);
    const { base } = splitExtension(file.name);

    return {
      ok: true,
      output: {
        name: `${base}${EXTENSION_BY_FORMAT[options.targetFormat]}`,
        blob,
        sizeBytes: blob.size,
        mimeType: options.targetFormat,
      },
    };
  } catch (thrown) {
    return { ok: false, error: toAppError(thrown) };
  }
}
