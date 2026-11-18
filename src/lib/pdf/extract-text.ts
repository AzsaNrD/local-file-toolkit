import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { basenameOf } from "./load";
import { errors, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type ExtractTextResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

function isTextItem(item: unknown): item is TextItem {
  return typeof item === "object" && item !== null && "str" in item;
}

/**
 * Groups a page's text items into lines by their y-position (pdf.js gives no
 * line breaks of its own), then reads each line left to right. A simple
 * heuristic, not real layout analysis, so columns or tables won't come out
 * perfectly, but it's honest for a "get the text out" tool.
 */
function reconstructPageText(items: TextItem[]): string {
  const lines: { y: number; parts: { x: number; str: string }[] }[] = [];

  for (const item of items) {
    if (!item.str) continue;
    const y = Math.round(item.transform[5]);
    let line = lines.find((candidate) => Math.abs(candidate.y - y) < 2);
    if (!line) {
      line = { y, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x: item.transform[4], str: item.str });
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.parts
        .sort((a, b) => a.x - b.x)
        .map((part) => part.str)
        .join(""),
    )
    .join("\n");
}

/** Not in the original 11 tools: reads every page's text out to a plain .txt file, via pdf.js. */
export async function extractTextFromPdf(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<ExtractTextResult> {
  const bytes = await file.arrayBuffer();

  let pdf;
  try {
    // Dynamic import, not a top-level one (PRD 12.1.4): pdfjs-dist must
    // never be evaluated during SSR, only lazily in the browser.
    const { loadPdfForThumbnails } = await import("./thumbnails");
    pdf = await loadPdfForThumbnails(bytes);
  } catch (thrown) {
    return {
      ok: false,
      error:
        thrown instanceof Error && thrown.name === "PasswordException"
          ? errors.encryptedPdf()
          : errors.corruptFile(),
    };
  }

  const pageTexts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pageTexts.push(reconstructPageText(textContent.items.filter(isTextItem)));
    page.cleanup();
    onProgress?.(pageNumber, pdf.numPages);
  }

  const combined = pageTexts.map((text, index) => `--- Page ${index + 1} ---\n${text}`).join("\n\n");
  const blob = new Blob([combined], { type: "text/plain;charset=utf-8" });

  return {
    ok: true,
    output: {
      name: `${basenameOf(file.name)}.txt`,
      blob,
      sizeBytes: blob.size,
      mimeType: "text/plain",
    },
  };
}
