"use client";

import { useEffect, useState } from "react";
import type { OutputFile } from "@/lib/types";

/**
 * One preview image per output, keyed by index: an object URL for an image
 * output (instant), or a rendered first page for a PDF output (async, via
 * pdf.js). An output with neither mime type is left out, and the caller
 * falls back to a generic icon.
 */
export function useOutputPreviews(outputs: OutputFile[]): Record<number, string> {
  const [previews, setPreviews] = useState<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    (async () => {
      const next: Record<number, string> = {};
      for (const [index, output] of outputs.entries()) {
        if (output.mimeType.startsWith("image/")) {
          const url = URL.createObjectURL(output.blob);
          createdUrls.push(url);
          next[index] = url;
        } else if (output.mimeType === "application/pdf") {
          try {
            // Dynamic import, not a top-level one (PRD 12.1.4): pdfjs-dist
            // must never be evaluated during SSR, only lazily in the browser.
            const { loadPdfForThumbnails, renderThumbnail } = await import("@/lib/pdf/thumbnails");
            const bytes = await output.blob.arrayBuffer();
            const pdf = await loadPdfForThumbnails(bytes);
            next[index] = await renderThumbnail(pdf, 1, 480);
          } catch {
            // No preview for a PDF that fails to render; falls back to a generic icon.
          }
        }
      }
      if (!cancelled) setPreviews(next);
    })();

    return () => {
      cancelled = true;
      for (const url of createdUrls) URL.revokeObjectURL(url);
    };
  }, [outputs]);

  return previews;
}
