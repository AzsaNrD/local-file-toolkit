"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

interface PreviewState {
  key: string;
  url?: string;
  pageCount?: number;
  /** The page that was actually drawn, after resolving "last page". */
  pageNumber?: number;
  failed?: boolean;
}

/**
 * One large preview of a single PDF page. `pageNumber` 0 means the last page,
 * resolved here because the page count is only known once the file is open.
 * The pdf.js document is opened once per file and reused for every page change.
 */
export function usePdfPagePreview(file: File | null, pageNumber: number, width = 640) {
  const [state, setState] = useState<PreviewState>({ key: "" });
  const loaded = useRef<{ file: File; pdf: PDFDocumentProxy } | null>(null);
  const key = file ? `${file.name}:${file.size}:${file.lastModified}:${pageNumber}` : "";

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        // Dynamic import (PRD 12.1.4): pdfjs-dist must never be evaluated during SSR.
        const { loadPdfForThumbnails, renderThumbnail } = await import("@/lib/pdf/thumbnails");
        if (!loaded.current || loaded.current.file !== file) {
          const previous = loaded.current;
          loaded.current = null;
          void previous?.pdf.loadingTask.destroy();
          loaded.current = { file, pdf: await loadPdfForThumbnails(await file.arrayBuffer()) };
        }
        const { pdf } = loaded.current;
        const target = pageNumber === 0 ? pdf.numPages : Math.min(Math.max(1, pageNumber), pdf.numPages);
        const url = await renderThumbnail(pdf, target, width);
        if (!cancelled) setState({ key, url, pageCount: pdf.numPages, pageNumber: target });
      } catch {
        if (!cancelled) setState({ key, failed: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, pageNumber, width, key]);

  useEffect(() => {
    return () => {
      void loaded.current?.pdf.loadingTask.destroy();
      loaded.current = null;
    };
  }, []);

  return { ...state, loading: file !== null && state.key !== key };
}
