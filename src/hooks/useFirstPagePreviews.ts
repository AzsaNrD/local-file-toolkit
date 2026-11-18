"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A first-page preview (data URL) per PDF, keyed by file id rather than list
 * position: removing a file from the middle of a list would otherwise hand
 * its neighbour the wrong thumbnail until the next render pass finished.
 * Each id is rendered once, one at a time. A PDF pdf.js cannot open (for
 * example a password-protected one) just never gets an entry.
 */
export function useFirstPagePreviews(items: { id: string; file: File }[]): Record<string, string> {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    (async () => {
      for (const item of items) {
        if (requested.current.has(item.id)) continue;
        requested.current.add(item.id);
        try {
          // Dynamic import, not a top-level one (PRD 12.1.4): pdfjs-dist
          // must never be evaluated during SSR, only lazily in the browser.
          const { loadPdfForThumbnails, renderThumbnail } = await import("@/lib/pdf/thumbnails");
          const pdf = await loadPdfForThumbnails(await item.file.arrayBuffer());
          const dataUrl = await renderThumbnail(pdf, 1, 480);
          setPreviews((current) => ({ ...current, [item.id]: dataUrl }));
        } catch {
          // No preview for this file; the list falls back to its generic icon.
        }
      }
    })();
  }, [items]);

  return previews;
}
