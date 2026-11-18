import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { detectGhostscriptCapability } from "@/lib/ghostscript";
import { errorResponse, runProcessCapturing, safeDownloadBasename } from "@/lib/server-convert";

// Not in the PRD. Added at the project owner's request, following the same
// capability-gated Ghostscript pattern as compress-pdf: pdf-lib can neither
// encrypt nor decrypt, and Ghostscript can do both.
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_FILE_SIZE_MB = 100;
const TIMEOUT_MS = 120_000;
// Ghostscript's pdfwrite accepts passwords up to 32 bytes.
const MAX_NEW_PASSWORD_LENGTH = 32;
const MAX_UNLOCK_PASSWORD_LENGTH = 128;

const fileMetaSchema = z.object({
  name: z.string().min(1).regex(/\.pdf$/i, "must be a .pdf file"),
  size: z
    .number()
    .positive()
    .max(MAX_FILE_SIZE_MB * 1024 * 1024),
});

/** Printable ASCII only: the PDF password format has no single agreed encoding beyond it. */
const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

export async function POST(request: Request) {
  let tmpDir: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const action = formData.get("action");
    const password = formData.get("password");

    if (!(file instanceof File)) {
      return errorResponse(400, "UNSUPPORTED_TYPE", "No file was uploaded.");
    }
    if (action !== "protect" && action !== "unlock") {
      return errorResponse(400, "UNKNOWN", "Choose whether to protect or unlock the PDF.");
    }
    if (typeof password !== "string" || password.length === 0) {
      return errorResponse(400, "UNKNOWN", "Enter a password.");
    }
    if (action === "protect") {
      if (password.length > MAX_NEW_PASSWORD_LENGTH) {
        return errorResponse(
          400,
          "UNKNOWN",
          `Use a password of ${MAX_NEW_PASSWORD_LENGTH} characters or fewer.`,
        );
      }
      if (!PRINTABLE_ASCII.test(password)) {
        return errorResponse(
          400,
          "UNKNOWN",
          "Use letters, numbers, and common symbols only, so every PDF reader accepts the password.",
        );
      }
    } else if (password.length > MAX_UNLOCK_PASSWORD_LENGTH || password.includes("\0")) {
      return errorResponse(400, "UNKNOWN", "That password is not valid.");
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
        "Ghostscript is not installed on this computer, so password tools are turned off.",
      );
    }

    tmpDir = await mkdtemp(path.join(os.tmpdir(), "local-file-toolkit-"));
    // Fixed on-disk names: the user's filename never touches the filesystem.
    const inputPath = path.join(tmpDir, "input.pdf");
    const outputPath = path.join(tmpDir, "output.pdf");
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    // PRD 12.6: an argument array, never a shell string, so the password cannot be interpreted as a command.
    const baseArgs = ["-sDEVICE=pdfwrite", "-dNOPAUSE", "-dBATCH", "-dQUIET", `-sOutputFile=${outputPath}`];
    const args =
      action === "protect"
        ? [
            "-dCompatibilityLevel=1.6",
            // Ghostscript 10 writes revisions 2 and 3 only: 128-bit RC4 is the strongest it offers.
            "-dEncryptionR=3",
            "-dKeyLength=128",
            `-sOwnerPassword=${password}`,
            `-sUserPassword=${password}`,
            ...baseArgs,
            inputPath,
          ]
        : [`-sPDFPassword=${password}`, ...baseArgs, inputPath];

    const outcome = await runProcessCapturing(ghostscript.path, args, TIMEOUT_MS);

    if (outcome.status === "timeout") {
      return errorResponse(504, "TIMEOUT", "This took too long and was stopped.");
    }

    // Ghostscript exits 0 and still leaves a page-less PDF behind on a password failure,
    // so its own messages decide the outcome, not the exit code or the output file.
    if (/password did not work/i.test(outcome.output)) {
      return errorResponse(
        422,
        "ENCRYPTED_PDF",
        "That password did not work for this PDF. Check it and try again.",
      );
    }
    if (/requires a password/i.test(outcome.output)) {
      return errorResponse(
        422,
        "ENCRYPTED_PDF",
        action === "protect"
          ? "This PDF already has a password. Unlock it first, then protect it again."
          : "This PDF needs a password to open.",
      );
    }
    if (
      !existsSync(outputPath) ||
      (await stat(outputPath)).size === 0 ||
      /no pages will be processed|couldn't initialise/i.test(outcome.output)
    ) {
      return errorResponse(
        422,
        "CONVERSION_FAILED",
        "The file could not be processed. It may be damaged or use features we cannot handle.",
      );
    }

    const pdfBytes = await readFile(outputPath);
    const suffix = action === "protect" ? "protected" : "unlocked";

    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeDownloadBasename(file.name)}-${suffix}.pdf"`,
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
