import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { convertPdfWithWord, detectWordCapability } from "@/lib/word";
import { errorResponse, safeDownloadBasename, sanitizeExtension } from "@/lib/server-convert";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_SIZE_MB = 50;
const TIMEOUT_MS = 90_000;

const fileMetaSchema = z.object({
  name: z.string().min(1),
  size: z
    .number()
    .positive()
    .max(MAX_FILE_SIZE_MB * 1024 * 1024),
});

/**
 * pdf-lib accepts almost anything that starts with the PDF marker and only fails later, when
 * asked for the pages, so a real file is one that has the marker and at least one page.
 */
async function isReadablePdf(bytes: Buffer): Promise<boolean> {
  if (!bytes.subarray(0, 1024).includes("%PDF-")) return false;
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return pdf.getPageCount() > 0;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let tmpDir: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return errorResponse(400, "UNSUPPORTED_TYPE", "No file was uploaded.");
    }

    const parsedMeta = fileMetaSchema.safeParse({ name: file.name, size: file.size });
    if (!parsedMeta.success) {
      const tooLarge = file.size > MAX_FILE_SIZE_MB * 1024 * 1024;
      return tooLarge
        ? errorResponse(
            413,
            "FILE_TOO_LARGE",
            `This file is larger than the ${MAX_FILE_SIZE_MB} MB limit for this tool.`,
          )
        : errorResponse(400, "UNSUPPORTED_TYPE", "This file could not be read.");
    }

    if (sanitizeExtension(file.name) !== ".pdf") {
      return errorResponse(400, "UNSUPPORTED_TYPE", "This file type is not supported.");
    }

    const word = await detectWordCapability();
    if (!word.available || !word.version) {
      return errorResponse(
        503,
        "CAPABILITY_UNAVAILABLE",
        "Microsoft Word is not installed on this computer, so PDF to Word is turned off.",
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    // Word opens anything it recognises, so a text file renamed to .pdf, or a damaged PDF, would
    // come back as a "converted" document full of junk. Check the file really parses first.
    if (!(await isReadablePdf(bytes))) {
      return errorResponse(
        422,
        "CORRUPT_FILE",
        "This file could not be read. It may be damaged or not a real PDF.",
      );
    }
    // A locked PDF makes Word wait for a password nobody can type, so it is refused up front.
    // The unlock tool also clears owner-only locks, which Word would have opened.
    if (bytes.includes("/Encrypt")) {
      return errorResponse(
        422,
        "ENCRYPTED_PDF",
        "This PDF is password protected. Remove the password first (the Protect or unlock PDF tool can do it), then try again.",
      );
    }

    tmpDir = await mkdtemp(path.join(os.tmpdir(), "local-file-toolkit-"));
    // The user's original filename is never written to disk (PRD 9.2 step 4).
    const inputPath = path.join(tmpDir, "input.pdf");
    const outputPath = path.join(tmpDir, "output.docx");
    await writeFile(inputPath, bytes);

    const outcome = await convertPdfWithWord(tmpDir, inputPath, outputPath, word.version, TIMEOUT_MS);

    if (outcome === "timeout") {
      return errorResponse(504, "TIMEOUT", "This took too long and was stopped.");
    }
    if (outcome === "app-already-open") {
      return errorResponse(
        409,
        "INVALID_INPUT",
        "Microsoft Word is open on this computer. Close it, then try again.",
      );
    }
    if (outcome === "could-not-open") {
      return errorResponse(
        422,
        "CORRUPT_FILE",
        "This file could not be read. It may be damaged or not a real PDF.",
      );
    }
    if (outcome !== "ok" || !existsSync(outputPath)) {
      return errorResponse(
        422,
        "CONVERSION_FAILED",
        "The conversion did not finish. The file may use features we cannot handle.",
      );
    }

    const docxBytes = await readFile(outputPath);

    return new NextResponse(new Uint8Array(docxBytes), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeDownloadBasename(file.name)}.docx"`,
      },
    });
  } catch {
    return errorResponse(500, "UNKNOWN", "Something went wrong. Please try again.");
  } finally {
    // Runs on every path, including errors and timeouts (PRD 9.2 step 10).
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
