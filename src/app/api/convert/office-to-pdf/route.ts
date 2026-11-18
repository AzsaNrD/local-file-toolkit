import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { detectLibreOfficeCapability } from "@/lib/libreoffice";
import {
  convertToPdfWithOffice,
  detectOfficeAppCapability,
  officeAppFor,
  type OfficeApp,
} from "@/lib/office-pdf";
import {
  errorResponse,
  runProcessWithTimeout,
  safeDownloadBasename,
  sanitizeExtension,
  toFileUri,
} from "@/lib/server-convert";
import type { OfficeOutcome } from "@/lib/word";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_SIZE_MB = 50;
const TIMEOUT_MS = 120_000;
// Shorter than the route limit so a stuck Office app still leaves time to answer.
const OFFICE_TIMEOUT_MS = 90_000;
const ALLOWED_EXTENSIONS = [
  ".doc",
  ".docx",
  ".odt",
  ".rtf",
  ".xls",
  ".xlsx",
  ".ods",
  ".csv",
  ".ppt",
  ".pptx",
  ".odp",
];

const APP_NAMES: Record<OfficeApp, string> = {
  word: "Microsoft Word",
  excel: "Microsoft Excel",
  powerpoint: "Microsoft PowerPoint",
};

// New-format Office files are zip archives. A password turns one into an older container with
// this signature instead, so it is easy to spot without opening the file.
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
const ZIP_FORMATS = [".docx", ".xlsx", ".pptx"];

const fileMetaSchema = z.object({
  name: z.string().min(1),
  size: z
    .number()
    .positive()
    .max(MAX_FILE_SIZE_MB * 1024 * 1024),
});

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

    const extension = sanitizeExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return errorResponse(400, "UNSUPPORTED_TYPE", "This file type is not supported.");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (ZIP_FORMATS.includes(extension) && bytes.subarray(0, 4).equals(OLE_SIGNATURE)) {
      return errorResponse(
        422,
        "INVALID_INPUT",
        "This file is password protected. Remove the password in Office first, then try again.",
      );
    }

    const officeApp = officeAppFor(extension);
    const officeAvailable = officeApp ? (await detectOfficeAppCapability(officeApp)).available : false;
    const libreoffice = await detectLibreOfficeCapability();
    if (!officeAvailable && !(libreoffice.available && libreoffice.path)) {
      return errorResponse(
        503,
        "CAPABILITY_UNAVAILABLE",
        "No program that can open this file type is installed (Microsoft Office or LibreOffice), so Office conversion is turned off.",
      );
    }

    tmpDir = await mkdtemp(path.join(os.tmpdir(), "local-file-toolkit-"));
    // Sanitised extension only; the user's original filename is never
    // written to disk (PRD 9.2 step 4).
    const inputPath = path.join(tmpDir, `input${extension}`);
    await writeFile(inputPath, bytes);

    let pdfPath: string | null = null;
    let officeOutcome: OfficeOutcome | null = null;

    // The Office app that made the file renders it most faithfully, so it goes first.
    if (officeApp && officeAvailable) {
      const officeOutput = path.join(tmpDir, "office-output.pdf");
      officeOutcome = await convertToPdfWithOffice(
        officeApp,
        tmpDir,
        inputPath,
        officeOutput,
        OFFICE_TIMEOUT_MS,
      );
      if (officeOutcome === "timeout") {
        return errorResponse(504, "TIMEOUT", "This took too long and was stopped.");
      }
      if (officeOutcome === "ok" && existsSync(officeOutput)) pdfPath = officeOutput;
    }

    // LibreOffice takes over when Office is missing, already open, or could not open the file.
    if (!pdfPath) {
      if (!libreoffice.available || !libreoffice.path) {
        if (officeApp && officeOutcome === "app-already-open") {
          return errorResponse(
            409,
            "INVALID_INPUT",
            `${APP_NAMES[officeApp]} is open on this computer. Close it, then try again.`,
          );
        }
        if (officeOutcome === "could-not-open") {
          return errorResponse(
            422,
            "CORRUPT_FILE",
            "This file could not be read. It may be damaged or not a real file of this type.",
          );
        }
        return errorResponse(
          422,
          "CONVERSION_FAILED",
          "The conversion did not finish. The file may use features we cannot handle.",
        );
      }

      const profileDir = path.join(tmpDir, "profile");
      const outcome = await runProcessWithTimeout(
        libreoffice.path,
        [
          "--headless",
          "--norestore",
          "--invisible",
          `-env:UserInstallation=${toFileUri(profileDir)}`,
          "--convert-to",
          "pdf",
          "--outdir",
          tmpDir,
          inputPath,
        ],
        TIMEOUT_MS,
      );

      if (outcome === "timeout") {
        return errorResponse(504, "TIMEOUT", "This took too long and was stopped.");
      }

      const libreOfficeOutput = path.join(tmpDir, "input.pdf");
      if (!existsSync(libreOfficeOutput)) {
        return errorResponse(
          422,
          "CONVERSION_FAILED",
          "The conversion did not finish. The file may use features we cannot handle.",
        );
      }
      pdfPath = libreOfficeOutput;
    }

    const pdfBytes = await readFile(pdfPath);

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeDownloadBasename(file.name)}.pdf"`,
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
