import { PDFDocument } from "pdf-lib";
import { errors, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type LoadPdfResult = { ok: true; doc: PDFDocument } | { ok: false; error: AppError };

/** Strips a trailing ".pdf" (case-insensitive) for building output filenames. */
export function basenameOf(filename: string): string {
  return filename.replace(/\.pdf$/i, "");
}

export async function savePdfAsOutputFile(doc: PDFDocument, name: string): Promise<OutputFile> {
  const bytes = await doc.save();
  return {
    name,
    blob: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    sizeBytes: bytes.byteLength,
    mimeType: "application/pdf",
  };
}

/**
 * Safe PDFDocument.load wrapper (PRD 12.3): pdf-lib throws on encrypted
 * files, and `ignoreEncryption: true` is explicitly banned as a blanket
 * workaround because it can produce a document that saves incorrectly.
 * Every caller gets ENCRYPTED_PDF or CORRUPT_FILE instead of a raw throw.
 */
export async function loadPdf(
  bytes: ArrayBuffer,
  options: { updateMetadata?: boolean } = {},
): Promise<LoadPdfResult> {
  try {
    // pdf-lib stamps its own name and the current time into the file's
    // properties on load unless told not to; the properties editor turns that off.
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: options.updateMetadata ?? true,
    });
    // pdf-lib can "recover" a badly malformed file into a document that
    // resolves here but throws the moment anything touches its page tree.
    // Touching it now, inside this try, is what actually proves it usable;
    // without this, that crash surfaces later in whatever a caller happens
    // to do first, as a raw, unclassified error.
    doc.getPageCount();
    return { ok: true, doc };
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    if (/encrypt/i.test(message)) {
      return { ok: false, error: errors.encryptedPdf(message) };
    }
    // Any other failure (e.g. pdf-lib "recovering" a badly malformed file
    // far enough to throw a totally unrelated-looking error, like "Cannot
    // read properties of undefined (reading 'Pages')") still means this
    // wasn't a readable PDF; this function's contract is to never leak a
    // raw, unclassified error, so it defaults to CORRUPT_FILE rather than
    // an unhelpful "something went wrong".
    return { ok: false, error: errors.corruptFile(message) };
  }
}
