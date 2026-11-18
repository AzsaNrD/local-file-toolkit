import type { AppError } from "./errors";

export type ToolCategory = "pdf" | "image" | "convert" | "utility";
export type ExecutionMode = "client" | "server";
export type Capability = "libreoffice" | "ghostscript" | "word";

export interface ToolDefinition {
  /** URL segment, matches the folder name under app/tools/. */
  slug: string;
  /** Shown on the card and as the page H1. */
  title: string;
  /** One sentence, shown on the card. */
  description: string;
  category: ToolCategory;
  mode: ExecutionMode;
  /**
   * Required only when mode === "server". A list means any one of them is enough, for a tool
   * that has a preferred program and a fallback.
   */
  requires?: Capability | Capability[];
  /** lucide-react icon name. */
  icon: string;
  /** react-dropzone accept map, e.g. { "application/pdf": [".pdf"] }. */
  accept: Record<string, string[]>;
  /** Can the user drop more than one file. */
  multiple: boolean;
  /** Hard cap on file count. 1 when multiple is false. */
  maxFiles: number;
  /** Hard cap per file, in megabytes. */
  maxFileSizeMB: number;
}

export type RunStatus = "idle" | "running" | "success" | "error";

export interface OutputFile {
  name: string;
  blob: Blob;
  sizeBytes: number;
  mimeType: string;
}

export interface RunState {
  status: RunStatus;
  /** 0 to 100, or null when the operation cannot report progress. */
  progress: number | null;
  /** What is being worked on right now, for a batch ("File 2 of 5 · name.docx"), or null. */
  detail: string | null;
  outputs: OutputFile[];
  error: AppError | null;
  /** Milliseconds, set on success. */
  elapsedMs: number | null;
}

export interface CapabilityStatus {
  available: boolean;
  version: string | null;
  path: string | null;
}

export interface Capabilities {
  libreoffice: CapabilityStatus;
  ghostscript: CapabilityStatus;
  word: CapabilityStatus;
}
