import imageCompression, { type Options } from "browser-image-compression";
import { toAppError, type AppError } from "@/lib/errors";
import { splitExtension } from "@/lib/format";
import type { OutputFile } from "@/lib/types";

export type CompressMode = "target-size" | "quality";

export interface CompressOptions {
  mode: CompressMode;
  /** MB, mode "target-size" only. */
  targetSizeMB?: number;
  /** 0.1 to 1.0, mode "quality" only. */
  quality?: number;
  /** "Also limit longest side to N pixels" toggle, shared by both modes. */
  maxWidthOrHeight?: number;
}

export interface CompressFileResult {
  output: OutputFile;
  /** True when the input was already smaller than the target; not an error. */
  skipped: boolean;
}

export type CompressResult =
  | { ok: true; result: CompressFileResult }
  | { ok: false; error: AppError };

export async function compressImage(
  file: File,
  options: CompressOptions,
  onProgress?: (progress: number) => void,
): Promise<CompressResult> {
  try {
    const compressorOptions: Options = {
      useWebWorker: true,
      // Not part of the library's own docs, but required here: without an
      // explicit libURL its worker calls importScripts() on a jsdelivr CDN
      // URL by default, which would break the "nothing leaves this
      // computer" / offline guarantees (NF3, NF5, NF6). See
      // scripts/copy-pdf-worker.mjs for the local copy this points at.
      libURL: "/browser-image-compression.js",
      onProgress,
      maxWidthOrHeight: options.maxWidthOrHeight,
    };

    if (options.mode === "target-size") {
      compressorOptions.maxSizeMB = options.targetSizeMB ?? 1;
    } else {
      compressorOptions.maxSizeMB = Number.POSITIVE_INFINITY;
      compressorOptions.initialQuality = options.quality ?? 0.8;
    }

    const compressed = await imageCompression(file, compressorOptions);
    const { base } = splitExtension(file.name);
    const ext = splitExtension(compressed.name || file.name).ext || splitExtension(file.name).ext;

    return {
      ok: true,
      result: {
        skipped: compressed.size >= file.size,
        output: {
          name: `${base}-compressed${ext}`,
          blob: compressed,
          sizeBytes: compressed.size,
          mimeType: compressed.type || file.type,
        },
      },
    };
  } catch (thrown) {
    return { ok: false, error: toAppError(thrown) };
  }
}
