import { PDFName, PDFRawStream, PDFStream, decodePDFRawStream, type PDFDocument } from "pdf-lib";

export interface EditHistoryEntry {
  action: string;
  software: string | null;
  when: Date | null;
}

const EOF_MARKER = [0x25, 0x25, 0x45, 0x4f, 0x46]; // "%%EOF"
const LINEARIZED_MARKER = "/Linearized";
const MAX_HISTORY_ENTRIES = 50;

function countEofMarkers(bytes: Uint8Array): number {
  let count = 0;
  const last = bytes.length - EOF_MARKER.length;
  for (let i = 0; i <= last; i++) {
    if (bytes[i] !== EOF_MARKER[0]) continue;
    let matches = true;
    for (let j = 1; j < EOF_MARKER.length; j++) {
      if (bytes[i + j] !== EOF_MARKER[j]) {
        matches = false;
        break;
      }
    }
    if (matches) count++;
  }
  return count;
}

/**
 * Each "save" that appends to the file (rather than rewriting it) ends with
 * its own %%EOF marker, so the marker count is how many times the file was
 * saved onto itself. A "fast web view" (linearized) file writes two markers
 * for a single save, so that case is corrected by one. Saving under a new
 * name or printing to PDF rewrites the file from scratch and resets this to
 * 1, which is why it is reported as an estimate and never as proof that
 * nothing changed.
 */
export function countRevisions(bytes: Uint8Array): number {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  const markers = countEofMarkers(bytes);
  const linearized = head.includes(LINEARIZED_MARKER);
  return Math.max(1, markers - (linearized ? 1 : 0));
}

function readXmp(doc: PDFDocument): string | null {
  try {
    const stream = doc.catalog.lookupMaybe(PDFName.of("Metadata"), PDFStream);
    if (!stream) return null;
    const contents =
      stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
    return new TextDecoder("utf-8").decode(contents);
  } catch {
    return null;
  }
}

/** Namespace-agnostic: XMP writers put these values on the element as attributes or as child elements. */
function pickValue(element: Element, localName: string): string | null {
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.localName === localName) return attribute.value;
  }
  for (const child of Array.from(element.children)) {
    if (child.localName === localName) return child.textContent?.trim() || null;
  }
  return null;
}

/**
 * The edit history editing software (Acrobat, Word, and similar) chooses to
 * write into the file's XMP metadata. It exists only if the software wrote
 * it, so an empty result means "none recorded", not "never edited".
 */
export function readEditHistory(doc: PDFDocument): EditHistoryEntry[] {
  const xmp = readXmp(doc);
  if (!xmp) return [];

  const parsed = new DOMParser().parseFromString(xmp, "application/xml");
  if (parsed.querySelector("parsererror")) return [];

  const history = Array.from(parsed.getElementsByTagName("*")).find(
    (element) => element.localName === "History",
  );
  if (!history) return [];

  const entries: EditHistoryEntry[] = [];
  for (const item of Array.from(history.getElementsByTagName("*"))) {
    if (item.localName !== "li") continue;
    const action = pickValue(item, "action");
    if (!action) continue;
    const when = pickValue(item, "when");
    const date = when ? new Date(when) : null;
    entries.push({
      action,
      software: pickValue(item, "softwareAgent"),
      when: date && !Number.isNaN(date.getTime()) ? date : null,
    });
    if (entries.length >= MAX_HISTORY_ENTRIES) break;
  }
  return entries;
}
