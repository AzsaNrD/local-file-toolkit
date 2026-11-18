import { loadPdf } from "./load";
import { countRevisions, readEditHistory, type EditHistoryEntry } from "./history";
import { readSignatures, type PdfSignatureInfo } from "./signatures";
import { formatPageRange } from "@/lib/parse-page-range";
import type { AppError } from "@/lib/errors";

export interface PdfPageSizeGroup {
  widthPt: number;
  heightPt: number;
  orientation: "portrait" | "landscape" | "square";
  /** e.g. "A4", "US Letter", or null when no standard size matches closely. */
  paperSize: string | null;
  /** Compressed page list for this group, e.g. "1-9,12". */
  pageRange: string;
  pageCount: number;
}

export interface PdfInfo {
  fileName: string;
  fileSizeBytes: number;
  /** e.g. "1.7", or null if the header couldn't be read. */
  pdfVersion: string | null;
  pageCount: number;
  pageSizeGroups: PdfPageSizeGroup[];
  printRecommendation: string;
  /** Estimated saves onto the same file, from its save markers. See countRevisions. */
  revisionCount: number;
  /** History the editing software chose to record in the file's XMP metadata, oldest first. */
  editHistory: EditHistoryEntry[];
  signatures: PdfSignatureInfo[];
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

export type PdfInfoResult = { ok: true; info: PdfInfo } | { ok: false; error: AppError };

const PT_PER_INCH = 72;
// A real-world PDF's page box rarely lands on the exact point value of a
// standard size (rounding during export), so matches allow a small margin.
const TOLERANCE_PT = 2;

const STANDARD_SIZES: { name: string; widthPt: number; heightPt: number }[] = [
  { name: "A3", widthPt: 841.89, heightPt: 1190.55 },
  { name: "A4", widthPt: 595.28, heightPt: 841.89 },
  { name: "A5", widthPt: 419.53, heightPt: 595.28 },
  { name: "A6", widthPt: 297.64, heightPt: 419.53 },
  { name: "B5", widthPt: 498.9, heightPt: 708.66 },
  { name: "US Letter", widthPt: 612, heightPt: 792 },
  { name: "US Legal", widthPt: 612, heightPt: 1008 },
  { name: "US Tabloid", widthPt: 792, heightPt: 1224 },
  { name: "US Executive", widthPt: 522, heightPt: 756 },
];

function approxEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOLERANCE_PT;
}

function matchPaperSize(widthPt: number, heightPt: number): { name: string; orientation: "portrait" | "landscape" } | null {
  for (const size of STANDARD_SIZES) {
    if (approxEqual(widthPt, size.widthPt) && approxEqual(heightPt, size.heightPt)) {
      return { name: size.name, orientation: "portrait" };
    }
    if (approxEqual(widthPt, size.heightPt) && approxEqual(heightPt, size.widthPt)) {
      return { name: size.name, orientation: "landscape" };
    }
  }
  return null;
}

/** e.g. "210 x 297 mm (8.27 x 11.69 in)". */
export function formatPageDimensions(widthPt: number, heightPt: number): string {
  const toMm = (pt: number) => (pt / PT_PER_INCH) * 25.4;
  const toIn = (pt: number) => pt / PT_PER_INCH;
  return `${toMm(widthPt).toFixed(0)} x ${toMm(heightPt).toFixed(0)} mm (${toIn(widthPt).toFixed(2)} x ${toIn(heightPt).toFixed(2)} in)`;
}

/**
 * Spreadsheet apps run a cell that starts with = + - @ as a formula, and a
 * PDF's title or author is text from someone else's file, so those cells get
 * a leading apostrophe instead of being trusted.
 */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function describePageGroups(info: PdfInfo): string {
  return info.pageSizeGroups
    .map((group) => {
      const size = group.paperSize ?? formatPageDimensions(group.widthPt, group.heightPt);
      const where = group.pageCount === info.pageCount ? "all pages" : `pages ${group.pageRange}`;
      return `${size} ${group.orientation} (${where})`;
    })
    .join("; ");
}

/** One row per file, with a BOM so Excel reads the UTF-8 correctly. */
export function pdfInfosToCsv(infos: PdfInfo[]): string {
  const header = [
    "File",
    "Size (bytes)",
    "Pages",
    "PDF version",
    "Page sizes",
    "Title",
    "Author",
    "Subject",
    "Keywords",
    "Created with",
    "Produced with",
    "Created",
    "Modified",
    "Revisions",
    "Signed by",
  ];
  const rows = infos.map((info) => [
    info.fileName,
    String(info.fileSizeBytes),
    String(info.pageCount),
    info.pdfVersion ?? "",
    describePageGroups(info),
    info.title ?? "",
    info.author ?? "",
    info.subject ?? "",
    info.keywords ?? "",
    info.creator ?? "",
    info.producer ?? "",
    info.creationDate?.toISOString() ?? "",
    info.modificationDate?.toISOString() ?? "",
    String(info.revisionCount),
    info.signatures
      .filter((signature) => signature.signed)
      .map((signature) => signature.certificateHolder ?? signature.signerName ?? signature.fieldName)
      .join("; "),
  ]);
  return "﻿" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function buildPrintRecommendation(groups: PdfPageSizeGroup[], totalPages: number): string {
  if (groups.length === 0) return "";

  if (groups.length === 1) {
    const group = groups[0];
    if (group.paperSize) {
      return `Every page matches ${group.paperSize} (${group.orientation}). Select ${group.paperSize} in your printer's paper settings to print at full size, no scaling needed.`;
    }
    return `Every page is a custom size, ${formatPageDimensions(group.widthPt, group.heightPt)}, and doesn't closely match a standard paper size. Printing on a standard sheet will scale or crop the page.`;
  }

  const allNamed = groups.every((group) => group.paperSize);
  if (allNamed) {
    const uniqueNames = [...new Set(groups.map((group) => group.paperSize))];
    return `This document mixes page sizes across its ${totalPages} pages (${uniqueNames.join(", ")}). Check the list above and set your printer's paper size per page range.`;
  }
  return `This document mixes ${groups.length} different page sizes across its ${totalPages} pages, and some don't match a standard paper size. Check the list above before printing.`;
}

/**
 * Everything PDF Properties shows, computed once from the file: metadata via
 * pdf-lib's own getters, page sizes grouped by their post-rotation (visual)
 * dimensions, and a plain-language print recommendation derived from that
 * grouping. The PDF version isn't exposed by pdf-lib, so it's read directly
 * off the "%PDF-1.x" header bytes.
 */
export async function getPdfInfo(file: File): Promise<PdfInfoResult> {
  const bytes = await file.arrayBuffer();

  const headerText = new TextDecoder("latin1").decode(
    new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)),
  );
  const versionMatch = /%PDF-(\d\.\d)/.exec(headerText);
  const pdfVersion = versionMatch ? versionMatch[1] : null;

  // pdf-lib otherwise writes its own name and the current time into the properties it then
  // reports, which would show "pdf-lib" as the program that made every file.
  const loaded = await loadPdf(bytes, { updateMetadata: false });
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { doc } = loaded;

  const pages = doc.getPages();
  const rawGroups = new Map<string, { widthPt: number; heightPt: number; pageNumbers: number[] }>();

  pages.forEach((page, index) => {
    const { width, height } = page.getSize();
    // A page rotated 90/270 degrees is visually landscape even though its
    // underlying MediaBox is still portrait-shaped, so grouping and paper
    // matching both use the post-rotation size, not the raw one.
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const swapped = rotation === 90 || rotation === 270;
    const effectiveWidth = swapped ? height : width;
    const effectiveHeight = swapped ? width : height;

    const key = `${Math.round(effectiveWidth)}x${Math.round(effectiveHeight)}`;
    const existing = rawGroups.get(key);
    if (existing) existing.pageNumbers.push(index + 1);
    else rawGroups.set(key, { widthPt: effectiveWidth, heightPt: effectiveHeight, pageNumbers: [index + 1] });
  });

  const pageSizeGroups: PdfPageSizeGroup[] = [...rawGroups.values()]
    .sort((a, b) => b.pageNumbers.length - a.pageNumbers.length)
    .map((group) => {
      const match = matchPaperSize(group.widthPt, group.heightPt);
      const orientation: PdfPageSizeGroup["orientation"] = approxEqual(group.widthPt, group.heightPt)
        ? "square"
        : group.widthPt > group.heightPt
          ? "landscape"
          : "portrait";
      return {
        widthPt: group.widthPt,
        heightPt: group.heightPt,
        orientation,
        paperSize: match?.name ?? null,
        pageRange: formatPageRange(group.pageNumbers),
        pageCount: group.pageNumbers.length,
      };
    });

  return {
    ok: true,
    info: {
      fileName: file.name,
      fileSizeBytes: file.size,
      pdfVersion,
      pageCount: pages.length,
      pageSizeGroups,
      printRecommendation: buildPrintRecommendation(pageSizeGroups, pages.length),
      revisionCount: countRevisions(new Uint8Array(bytes)),
      editHistory: readEditHistory(doc),
      signatures: readSignatures(doc, file.size),
      title: doc.getTitle() || undefined,
      author: doc.getAuthor() || undefined,
      subject: doc.getSubject() || undefined,
      keywords: doc.getKeywords() || undefined,
      creator: doc.getCreator() || undefined,
      producer: doc.getProducer() || undefined,
      creationDate: doc.getCreationDate(),
      modificationDate: doc.getModificationDate(),
    },
  };
}
