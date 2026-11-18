import { PDFDict, PDFName, type PDFDocument } from "pdf-lib";
import { basenameOf, loadPdf, savePdfAsOutputFile } from "./load";
import type { AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export interface PdfProperties {
  title: string;
  author: string;
  subject: string;
  /** One string, as stored in the file. */
  keywords: string;
  creator: string;
  producer: string;
}

export const EMPTY_PROPERTIES: PdfProperties = {
  title: "",
  author: "",
  subject: "",
  keywords: "",
  creator: "",
  producer: "",
};

export type ReadPropertiesResult = { ok: true; properties: PdfProperties } | { ok: false; error: AppError };

export async function readPdfProperties(file: File): Promise<ReadPropertiesResult> {
  const loaded = await loadPdf(await file.arrayBuffer(), { updateMetadata: false });
  if (!loaded.ok) return loaded;
  const { doc } = loaded;
  return {
    ok: true,
    properties: {
      title: doc.getTitle() ?? "",
      author: doc.getAuthor() ?? "",
      subject: doc.getSubject() ?? "",
      keywords: doc.getKeywords() ?? "",
      creator: doc.getCreator() ?? "",
      producer: doc.getProducer() ?? "",
    },
  };
}

export interface WritePropertiesOptions {
  /** Drops the creation and modification dates. */
  removeDates: boolean;
  /**
   * Drops the XMP block, a second copy of the properties that editing programs also use to
   * keep their edit history. Leaving it in would keep the old values readable.
   */
  removeXmp: boolean;
}

export type WritePropertiesResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

const KEYS: Record<keyof PdfProperties, string> = {
  title: "Title",
  author: "Author",
  subject: "Subject",
  keywords: "Keywords",
  creator: "Creator",
  producer: "Producer",
};

/** The document information dictionary, or undefined when the file has none yet. */
function infoDict(doc: PDFDocument): PDFDict | undefined {
  const ref = doc.context.trailerInfo.Info;
  return ref ? doc.context.lookup(ref, PDFDict) : undefined;
}

/** An empty field removes the entry from the file instead of storing an empty string. */
export async function writePdfProperties(
  file: File,
  properties: PdfProperties,
  options: WritePropertiesOptions,
): Promise<WritePropertiesResult> {
  const loaded = await loadPdf(await file.arrayBuffer(), { updateMetadata: false });
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { doc } = loaded;
  const before = infoDict(doc);

  for (const field of Object.keys(KEYS) as (keyof PdfProperties)[]) {
    const value = properties[field].trim();
    if (value === "") before?.delete(PDFName.of(KEYS[field]));
  }
  if (properties.title.trim()) doc.setTitle(properties.title.trim());
  if (properties.author.trim()) doc.setAuthor(properties.author.trim());
  if (properties.subject.trim()) doc.setSubject(properties.subject.trim());
  // The file stores keywords as one string, so the text is kept exactly as typed.
  if (properties.keywords.trim()) doc.setKeywords([properties.keywords.trim()]);
  if (properties.creator.trim()) doc.setCreator(properties.creator.trim());
  if (properties.producer.trim()) doc.setProducer(properties.producer.trim());

  if (options.removeDates) {
    const after = infoDict(doc);
    after?.delete(PDFName.of("CreationDate"));
    after?.delete(PDFName.of("ModDate"));
  } else {
    doc.setModificationDate(new Date());
  }
  if (options.removeXmp) doc.catalog.delete(PDFName.of("Metadata"));

  const output = await savePdfAsOutputFile(doc, `${basenameOf(file.name)}-properties.pdf`);
  return { ok: true, output };
}
