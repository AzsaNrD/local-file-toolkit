import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { detectGhostscriptCapability } from "@/lib/ghostscript";
import { errorResponse, runProcessWithTimeout, safeDownloadBasename } from "@/lib/server-convert";

// Not in the PRD (Section 15 lists PDF compression as deferred future work,
// needing "a second external binary" after the LibreOffice pattern is
// proven). Added as a v1.1 extension at the project owner's request,
// following that exact same capability-gated server-tool pattern.
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_SIZE_MB = 100;
const TIMEOUT_MS = 120_000;

export type CompressionLevel = "screen" | "ebook" | "printer";
const VALID_LEVELS: CompressionLevel[] = ["screen", "ebook", "printer"];

const fileMetaSchema = z.object({
  name: z.string().min(1).regex(/\.pdf$/i, "must be a .pdf file"),
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
    const levelField = formData.get("level");
    const level: CompressionLevel = VALID_LEVELS.includes(levelField as CompressionLevel)
      ? (levelField as CompressionLevel)
      : "ebook";

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
        : errorResponse(400, "UNSUPPORTED_TYPE", "This tool only accepts PDF files.");
    }

    const ghostscript = await detectGhostscriptCapability();
    if (!ghostscript.available || !ghostscript.path) {
      return errorResponse(
        503,
        "CAPABILITY_UNAVAILABLE",
        "Ghostscript is not installed on this computer, so PDF compression is turned off.",
      );
    }

    tmpDir = await mkdtemp(path.join(os.tmpdir(), "local-file-toolkit-"));
    // Fixed, sanitised on-disk names only (PRD 9.2 step 4's rule, applied
    // here too): the user's original filename never touches the filesystem.
    const inputPath = path.join(tmpDir, "input.pdf");
    const outputPath = path.join(tmpDir, "output.pdf");
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    const outcome = await runProcessWithTimeout(
      ghostscript.path,
      [
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        `-dPDFSETTINGS=/${level}`,
        "-dNOPAUSE",
        "-dBATCH",
        "-dQUIET",
        `-sOutputFile=${outputPath}`,
        inputPath,
      ],
      TIMEOUT_MS,
    );

    if (outcome === "timeout") {
      return errorResponse(504, "TIMEOUT", "This took too long and was stopped.");
    }

    // Ghostscript, like LibreOffice (PRD 12.5), can exit 0 without writing
    // real output on a malformed input; the file's existence is what counts.
    if (!existsSync(outputPath)) {
      return errorResponse(
        422,
        "CONVERSION_FAILED",
        "The compression did not finish. The file may use features we cannot handle.",
      );
    }

    const pdfBytes = await readFile(outputPath);

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeDownloadBasename(file.name)}-compressed.pdf"`,
      },
    });
  } catch {
    return errorResponse(500, "UNKNOWN", "Something went wrong. Please try again.");
  } finally {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
