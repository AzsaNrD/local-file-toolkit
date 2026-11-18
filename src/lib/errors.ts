export type ErrorCode =
  | "FILE_TOO_LARGE"
  | "TOO_MANY_FILES"
  | "UNSUPPORTED_TYPE"
  | "CORRUPT_FILE"
  | "ENCRYPTED_PDF"
  | "INVALID_PAGE_RANGE"
  | "EMPTY_SELECTION"
  | "INVALID_INPUT"
  | "CONVERSION_FAILED"
  | "CAPABILITY_UNAVAILABLE"
  | "TIMEOUT"
  | "OUT_OF_MEMORY"
  | "UNKNOWN";

export interface AppError {
  code: ErrorCode;
  /** User-facing, plain language, no stack traces, no library names. */
  message: string;
  /** Developer detail, logged to console only, never rendered. */
  detail?: string;
}

function appError(code: ErrorCode, message: string, detail?: string): AppError {
  return { code, message, detail };
}

/**
 * Factories for every error code. Centralised here so the non-technical,
 * user-facing wording (PRD Section 7.3) is written once and reused by every
 * tool implementation instead of being restated per tool.
 */
export const errors = {
  fileTooLarge: (maxFileSizeMB: number, detail?: string): AppError =>
    appError(
      "FILE_TOO_LARGE",
      `This file is larger than the ${maxFileSizeMB} MB limit for this tool.`,
      detail,
    ),
  tooManyFiles: (maxFiles: number, detail?: string): AppError =>
    appError(
      "TOO_MANY_FILES",
      `You can add up to ${maxFiles} files at a time for this tool.`,
      detail,
    ),
  unsupportedType: (detail?: string): AppError =>
    appError(
      "UNSUPPORTED_TYPE",
      "This file type is not supported by this tool.",
      detail,
    ),
  corruptFile: (detail?: string): AppError =>
    appError(
      "CORRUPT_FILE",
      "This file could not be read. It may be damaged or not a real file of this type.",
      detail,
    ),
  encryptedPdf: (detail?: string): AppError =>
    appError(
      "ENCRYPTED_PDF",
      "This PDF is password protected. Remove the password first (the Protect or unlock PDF tool can do it), then try again.",
      detail,
    ),
  invalidPageRange: (pageCount: number, detail?: string): AppError =>
    appError(
      "INVALID_PAGE_RANGE",
      `Check the page numbers. This document has ${pageCount} pages.`,
      detail,
    ),
  emptySelection: (detail?: string): AppError =>
    appError(
      "EMPTY_SELECTION",
      "Select at least one page before continuing.",
      detail,
    ),
  /** For a setting the person can fix: the message says what to change. */
  invalidInput: (message: string, detail?: string): AppError =>
    appError("INVALID_INPUT", message, detail),
  conversionFailed: (detail?: string): AppError =>
    appError(
      "CONVERSION_FAILED",
      "The conversion did not finish. The file may use features we cannot handle.",
      detail,
    ),
  capabilityUnavailable: (message: string, detail?: string): AppError =>
    appError("CAPABILITY_UNAVAILABLE", message, detail),
  timeout: (detail?: string): AppError =>
    appError(
      "TIMEOUT",
      "This took too long and was stopped.",
      detail,
    ),
  outOfMemory: (detail?: string): AppError =>
    appError(
      "OUT_OF_MEMORY",
      "This file is too large for the browser to process. Try a smaller file.",
      detail,
    ),
  unknown: (detail?: string): AppError =>
    appError("UNKNOWN", "Something went wrong. Please try again.", detail),
};

function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

/** Normalises any thrown value into an AppError, for a tool run's catch block. */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  if (value instanceof Error) return errors.unknown(value.message);
  return errors.unknown(String(value));
}

/** pdf.js reports a locked file by name; a file it cannot parse at all is a damaged one. */
export function fromPdfJsError(value: unknown): AppError {
  const name = typeof value === "object" && value !== null && "name" in value ? String(value.name) : "";
  if (name === "PasswordException") return errors.encryptedPdf();
  if (name === "InvalidPDFException" || name === "FormatError") return errors.corruptFile(name);
  return toAppError(value);
}
