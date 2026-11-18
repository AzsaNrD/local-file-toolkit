import type { Capability, ToolDefinition } from "./types";

const PDF_ACCEPT = { "application/pdf": [".pdf"] };
const IMAGE_ACCEPT_BASIC = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};
const IMAGE_ACCEPT_WITH_WEBP = {
  ...IMAGE_ACCEPT_BASIC,
  "image/webp": [".webp"],
};

/**
 * The tool registry: the single source of truth for the home page grid, tool
 * page headers, and dropzone config (PRD Section 7.1). Icon names are
 * lucide-react exports, picked for a specific reason rather than the generic
 * sparkle/lightning defaults antislop flags: merge/split/delete/rotate/reorder
 * map to the literal page operation, and the two image-scale tools
 * (compress/resize) are distinguished as shrink-to-target vs. crop-to-box.
 *
 * `compress-pdf` is not in the PRD (Section 15 defers PDF compression to
 * future work, pending Ghostscript); it was added afterward at the project
 * owner's request, following the same server + capability-gate pattern as
 * `office-to-pdf`.
 *
 * `pdf-info` is also not in the PRD; added afterward at the project owner's
 * request. Unlike the other additions it needs no external binary: page
 * size and metadata are read straight out of the PDF's own object structure
 * with pdf-lib, entirely client-side.
 *
 * `watermark-pdf`, `page-numbers`, and `extract-text` are also not in the
 * PRD; added afterward at the project owner's request. All three are
 * client-side only (pdf-lib for drawing, pdf.js for text extraction).
 *
 * `ocr-pdf` and `fill-form` are also not in the PRD; added afterward at the
 * project owner's request. `ocr-pdf` uses Tesseract.js (self-hosted, see
 * scripts/copy-pdf-worker.mjs) to make scanned pages searchable; `fill-form`
 * uses pdf-lib's AcroForm support. Both client-side only.
 *
 * `strip-metadata`, `pdf-password`, and `sign-pdf` are also not in the PRD;
 * added afterward at the project owner's request. `strip-metadata` and
 * `sign-pdf` are client-side only (byte-level container rewrite, pdf-lib).
 * `pdf-password` follows the compress-pdf server + Ghostscript pattern, since
 * pdf-lib cannot encrypt or decrypt.
 *
 * `crop-image`, `crop-pdf`, `pdf-metadata`, `redact-pdf`, `extract-images`,
 * `compare-pdf`, and `batch-rename` are also not in the PRD; added afterward at
 * the project owner's request. All client-side only. `redact-pdf` rasterizes the
 * pages it outputs, because covering text with a box leaves the text in the file.
 *
 * `replace-pages` is also not in the PRD; added afterward at the project
 * owner's request. Client-side only: it combines the delete-pages thumbnail
 * grid with a second PDF whose pages are inserted at the deleted spot.
 *
 * `pdf-to-word` is also not in the PRD (Section 15 defers it over poor
 * fidelity); added afterward at the project owner's request. LibreOffice
 * leaves every line in a text box, so this one drives Microsoft Word, which
 * reflows a PDF into real paragraphs. Windows only, gated on Word being
 * installed (see lib/word.ts).
 */
export const TOOLS: ToolDefinition[] = [
  {
    slug: "merge-pdf",
    title: "Merge PDF",
    description: "Combine two or more PDFs into a single document, in the order you choose.",
    category: "pdf",
    mode: "client",
    icon: "Merge",
    accept: PDF_ACCEPT,
    multiple: true,
    maxFiles: 20,
    maxFileSizeMB: 100,
  },
  {
    slug: "split-pdf",
    title: "Split PDF",
    description: "Pull a page range, single pages, or fixed-size chunks out of a PDF.",
    category: "pdf",
    mode: "client",
    icon: "Scissors",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "pdf-info",
    title: "PDF Properties",
    description: "Check page size, metadata, and print paper for one or several PDFs at once.",
    category: "pdf",
    mode: "client",
    icon: "FileSearch",
    accept: PDF_ACCEPT,
    multiple: true,
    maxFiles: 10,
    maxFileSizeMB: 100,
  },
  {
    slug: "watermark-pdf",
    title: "Watermark PDF",
    description: "Stamp text or a logo image onto every page.",
    category: "pdf",
    mode: "client",
    icon: "Stamp",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "ocr-pdf",
    title: "Make PDF searchable",
    description: "Recognize text in a scanned PDF so it can be searched, selected, and copied.",
    category: "pdf",
    mode: "client",
    icon: "ScanSearch",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    // Lower than the other PDF tools' 100 MB: OCR re-renders and recognizes
    // every page, so a huge scanned document could otherwise tie up the
    // browser for a very long time.
    maxFileSizeMB: 50,
  },
  {
    slug: "fill-form",
    title: "Fill PDF form",
    description: "Fill in a PDF's form fields, and optionally lock it afterward.",
    category: "pdf",
    mode: "client",
    icon: "ClipboardList",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "page-numbers",
    title: "Page numbers",
    description: "Add a running page number to every page, in the position you choose.",
    category: "pdf",
    mode: "client",
    icon: "Hash",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "extract-text",
    title: "Extract text",
    description: "Pull every page's text out into a plain .txt file.",
    category: "convert",
    mode: "client",
    icon: "ScanText",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "remove-pages",
    title: "Delete pages",
    description: "Pick pages on a thumbnail grid and remove them from a PDF.",
    category: "pdf",
    mode: "client",
    icon: "Trash2",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "replace-pages",
    title: "Replace pages",
    description: "Delete pages from a PDF and slot another PDF into the same spot.",
    category: "pdf",
    mode: "client",
    icon: "Replace",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "rotate-pdf",
    title: "Rotate PDF",
    description: "Rotate individual pages or the whole document, 90 degrees at a time.",
    category: "pdf",
    mode: "client",
    icon: "RotateCw",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "reorder-pdf",
    title: "Reorder pages",
    description: "Drag pages into a new order, or reverse the whole document.",
    category: "pdf",
    mode: "client",
    icon: "ArrowUpDown",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "compress-pdf",
    title: "Compress PDF",
    description: "Shrink a PDF's file size using Ghostscript.",
    category: "pdf",
    mode: "server",
    requires: "ghostscript",
    icon: "FileArchive",
    accept: PDF_ACCEPT,
    multiple: true,
    maxFiles: 10,
    maxFileSizeMB: 100,
  },
  {
    slug: "pdf-to-image",
    title: "PDF to images",
    description: "Render PDF pages to PNG or JPEG at the resolution you need.",
    category: "convert",
    mode: "client",
    icon: "FileImage",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "image-to-pdf",
    title: "Images to PDF",
    description: "Turn a batch of photos into one PDF, one image per page.",
    category: "convert",
    mode: "client",
    icon: "FileOutput",
    accept: IMAGE_ACCEPT_BASIC,
    multiple: true,
    maxFiles: 50,
    maxFileSizeMB: 50,
  },
  {
    slug: "compress-image",
    title: "Compress image",
    description: "Shrink an image toward a target file size or quality level.",
    category: "image",
    mode: "client",
    icon: "Shrink",
    accept: IMAGE_ACCEPT_WITH_WEBP,
    multiple: true,
    maxFiles: 30,
    maxFileSizeMB: 50,
  },
  {
    slug: "resize-image",
    title: "Resize image",
    description: "Resize by exact dimensions, by percentage, or to fit inside a box.",
    category: "image",
    mode: "client",
    icon: "Crop",
    accept: IMAGE_ACCEPT_WITH_WEBP,
    multiple: true,
    maxFiles: 30,
    maxFileSizeMB: 50,
  },
  {
    slug: "convert-image",
    title: "Convert image format",
    description: "Convert between JPEG, PNG, WebP, and BMP.",
    category: "convert",
    mode: "client",
    icon: "RefreshCw",
    accept: { ...IMAGE_ACCEPT_WITH_WEBP, "image/bmp": [".bmp"] },
    multiple: true,
    maxFiles: 30,
    maxFileSizeMB: 50,
  },
  {
    slug: "strip-metadata",
    title: "Remove image metadata",
    description: "Strip GPS location, camera details, and comments from photos without recompressing them.",
    category: "image",
    mode: "client",
    icon: "Eraser",
    accept: IMAGE_ACCEPT_WITH_WEBP,
    multiple: true,
    maxFiles: 30,
    maxFileSizeMB: 50,
  },
  {
    slug: "pdf-password",
    title: "Protect or unlock PDF",
    description: "Add a password to a PDF, or remove one you already know, using Ghostscript.",
    category: "pdf",
    mode: "server",
    requires: "ghostscript",
    icon: "LockKeyhole",
    accept: PDF_ACCEPT,
    multiple: true,
    maxFiles: 10,
    maxFileSizeMB: 100,
  },
  {
    slug: "sign-pdf",
    title: "Sign PDF",
    description: "Draw or upload a signature and place it on a page of your PDF.",
    category: "pdf",
    mode: "client",
    icon: "Signature",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "office-to-pdf",
    title: "Office to PDF",
    description:
      "Convert Word, Excel, and PowerPoint files to PDF, using Microsoft Office when installed and LibreOffice otherwise.",
    category: "convert",
    mode: "server",
    // "word" stands for Microsoft Office as a whole; the route checks the specific app per file.
    requires: ["word", "libreoffice"],
    icon: "FileType2",
    accept: {
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.oasis.opendocument.text": [".odt"],
      "application/rtf": [".rtf"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
      "text/csv": [".csv"],
      "application/vnd.ms-powerpoint": [".ppt"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
      "application/vnd.oasis.opendocument.presentation": [".odp"],
    },
    multiple: true,
    maxFiles: 10,
    maxFileSizeMB: 50,
  },
  {
    slug: "pdf-to-word",
    title: "PDF to Word",
    description: "Turn a PDF into an editable Word file, using Microsoft Word on this computer.",
    category: "convert",
    mode: "server",
    requires: "word",
    icon: "FileText",
    accept: PDF_ACCEPT,
    multiple: true,
    maxFiles: 10,
    maxFileSizeMB: 50,
  },
  {
    slug: "crop-image",
    title: "Crop image",
    description: "Cut a photo to a free or fixed shape, and turn it a quarter at a time.",
    category: "image",
    mode: "client",
    icon: "Frame",
    accept: IMAGE_ACCEPT_WITH_WEBP,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 50,
  },
  {
    slug: "crop-pdf",
    title: "Crop PDF",
    description: "Trim the margins off every page, with a live preview of what stays.",
    category: "pdf",
    mode: "client",
    icon: "Crop",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "pdf-metadata",
    title: "Edit PDF properties",
    description: "Change or clear the title, author, subject, and keywords stored in a PDF.",
    category: "pdf",
    mode: "client",
    icon: "FilePen",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "redact-pdf",
    title: "Redact PDF",
    description: "Black out names, numbers, and other private details so they cannot be recovered.",
    category: "pdf",
    mode: "client",
    icon: "EyeOff",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 50,
  },
  {
    slug: "extract-images",
    title: "Extract images",
    description: "Save the pictures embedded in a PDF as separate image files.",
    category: "convert",
    mode: "client",
    icon: "Images",
    accept: PDF_ACCEPT,
    multiple: false,
    maxFiles: 1,
    maxFileSizeMB: 100,
  },
  {
    slug: "compare-pdf",
    title: "Compare PDFs",
    description: "Put two versions of a document side by side and mark what changed on each page.",
    category: "pdf",
    mode: "client",
    icon: "Diff",
    accept: PDF_ACCEPT,
    multiple: true,
    maxFiles: 2,
    maxFileSizeMB: 50,
  },
  {
    slug: "batch-rename",
    title: "Batch rename",
    description: "Rename many files at once with a prefix, numbering, find and replace, or letter case.",
    category: "utility",
    mode: "client",
    icon: "TextCursorInput",
    accept: {},
    multiple: true,
    maxFiles: 100,
    maxFileSizeMB: 100,
  },
];

/** The capabilities a tool can use, as a list; a tool works when any one of them is present. */
export function requiredCapabilities(tool: ToolDefinition): Capability[] {
  if (!tool.requires) return [];
  return Array.isArray(tool.requires) ? tool.requires : [tool.requires];
}

export function getToolBySlug(slug: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.slug === slug);
}
