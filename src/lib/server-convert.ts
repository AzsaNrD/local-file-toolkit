import { spawn } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import type { AppError, ErrorCode } from "@/lib/errors";

/** Shared between the two server-conversion routes (office-to-pdf, compress-pdf). */

/** Keeps only alphanumerics and a leading dot, e.g. "../../evil.DOCX" -> ".docx". */
export function sanitizeExtension(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext.replace(/[^a-z0-9.]/g, "");
}

/** A safe Content-Disposition filename derived from the user's own name. */
export function safeDownloadBasename(originalName: string): string {
  return (
    path.basename(originalName, path.extname(originalName)).replace(/[^a-zA-Z0-9 _-]/g, "_") ||
    "converted"
  );
}

export function errorResponse(status: number, code: ErrorCode, message: string): NextResponse {
  return NextResponse.json({ code, message } satisfies AppError, { status });
}

/**
 * A `file://` URI needs forward slashes, and on Windows a third slash after
 * the scheme to separate it from the drive letter ("file:///C:/foo"); a
 * POSIX path is already absolute with one leading slash, so it only needs
 * two. Building this by hand (`file://${windowsPath}`) produces a URI
 * LibreOffice's own bootstrap silently rejects.
 */
export function toFileUri(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  return normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`;
}

/**
 * PRD 12.5's caution generalised: a converter binary can exit 0 without
 * writing real output, so callers must check for the output file
 * themselves; this only distinguishes "the process finished" from "it had
 * to be killed for taking too long".
 */
export function runProcessWithTimeout(
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<"ok" | "timeout"> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: "ok" | "timeout") => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    // PRD 12.6: argument array, never a shell string.
    const child = spawn(binary, args);
    const timer = setTimeout(() => {
      child.kill();
      finish("timeout");
    }, timeoutMs);

    child.on("close", () => {
      clearTimeout(timer);
      finish("ok");
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish("ok");
    });
  });
}

/**
 * Like runProcessWithTimeout, but also returns what the process printed.
 * Ghostscript exits 0 and still writes an empty PDF when a password is wrong,
 * so its messages are the only reliable signal. Output is capped so a noisy
 * process cannot grow memory.
 */
export function runProcessCapturing(
  binary: string,
  args: string[],
  timeoutMs: number,
): Promise<{ status: "ok" | "timeout"; output: string }> {
  const MAX_CAPTURE_BYTES = 64 * 1024;
  return new Promise((resolve) => {
    let settled = false;
    let output = "";
    const finish = (status: "ok" | "timeout") => {
      if (settled) return;
      settled = true;
      resolve({ status, output });
    };
    const capture = (chunk: Buffer) => {
      if (output.length < MAX_CAPTURE_BYTES) output += chunk.toString("utf8");
    };

    const child = spawn(binary, args);
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const timer = setTimeout(() => {
      child.kill();
      finish("timeout");
    }, timeoutMs);

    child.on("close", () => {
      clearTimeout(timer);
      finish("ok");
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish("ok");
    });
  });
}
