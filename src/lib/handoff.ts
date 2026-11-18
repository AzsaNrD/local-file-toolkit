import { TOOLS } from "./tools";
import type { ToolDefinition } from "./types";

/**
 * Carries result files from one tool page to the next without a download and
 * re-upload. Module state survives the client-side navigation between tool
 * pages, and is gone on a full reload, which is the behaviour wanted: nothing
 * is written to disk or storage.
 */
let pending: { files: File[]; at: number } | null = null;

// Long enough for a slow first compile of the next tool page, short enough that a stale hand-off never leaks into later use.
const MAX_AGE_MS = 30_000;

export function setHandoff(files: File[]): void {
  pending = { files, at: Date.now() };
}

/** Same matching rules as the dropzone: a MIME type (exact or wildcard) or a file extension. */
export function matchesAccept(
  file: { name: string; type: string },
  accept: Record<string, string[]>,
): boolean {
  const name = file.name.toLowerCase();
  return Object.entries(accept).some(
    ([mime, extensions]) =>
      mime === file.type ||
      (mime.endsWith("/*") && file.type.startsWith(mime.slice(0, -1))) ||
      extensions.some((extension) => name.endsWith(extension.toLowerCase())),
  );
}

/** Hands over the waiting files that this tool accepts, once, and clears the slot either way. */
export function takeHandoff(accept: Record<string, string[]>): File[] {
  const current = pending;
  pending = null;
  if (!current || Date.now() - current.at > MAX_AGE_MS) return [];
  return current.files.filter((file) => matchesAccept(file, accept));
}

export interface HandoffCandidate {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

/** Tools that could take every one of these outputs as input, other than the one they came from. */
export function compatibleTools(
  outputs: HandoffCandidate[],
  currentSlug: string | null,
): ToolDefinition[] {
  if (outputs.length === 0) return [];
  return TOOLS.filter(
    (tool) =>
      tool.slug !== currentSlug &&
      outputs.length <= (tool.multiple ? tool.maxFiles : 1) &&
      outputs.every(
        (output) =>
          output.sizeBytes <= tool.maxFileSizeMB * 1024 * 1024 &&
          matchesAccept({ name: output.name, type: output.mimeType }, tool.accept),
      ),
  );
}
