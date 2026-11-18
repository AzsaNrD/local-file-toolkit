import { errors, type AppError } from "./errors";

export type ParsePageRangeResult =
  | { ok: true; pages: number[] }
  | { ok: false; error: AppError };

const RANGE_ITEM = /^(\d+)-(\d+)$/;
const SINGLE_ITEM = /^(\d+)$/;

type SegmentResult = { ok: true; pages: number[] } | { ok: false; error: AppError };

/** Parses one comma-separated segment ("7-10" or "1") into its page list. */
function parseSegment(part: string, pageCount: number): SegmentResult {
  const rangeMatch = RANGE_ITEM.exec(part);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start > end) {
      return { ok: false, error: errors.invalidPageRange(pageCount, `"${part}" starts after it ends`) };
    }
    if (start < 1 || end > pageCount) {
      return { ok: false, error: errors.invalidPageRange(pageCount, `"${part}" is out of range`) };
    }
    const pages: number[] = [];
    for (let page = start; page <= end; page++) pages.push(page);
    return { ok: true, pages };
  }

  const singleMatch = SINGLE_ITEM.exec(part);
  if (singleMatch) {
    const page = Number(singleMatch[1]);
    if (page < 1 || page > pageCount) {
      return { ok: false, error: errors.invalidPageRange(pageCount, `"${part}" is out of range`) };
    }
    return { ok: true, pages: [page] };
  }

  return { ok: false, error: errors.invalidPageRange(pageCount, `"${part}" could not be parsed`) };
}

function splitIntoParts(input: string): string[] {
  return input.replace(/\s+/g, "").split(",").filter((part) => part.length > 0);
}

/**
 * Parses a 1-indexed page range string ("1-3,7,9-11") against a known page
 * count, flattened into one sorted, deduplicated list. See PRD Section 8.2
 * for the exact syntax rules this implements.
 */
export function parsePageRange(input: string, pageCount: number): ParsePageRangeResult {
  const parts = splitIntoParts(input);
  if (parts.length === 0) {
    return { ok: false, error: errors.invalidPageRange(pageCount, "empty input") };
  }

  const pages = new Set<number>();
  for (const part of parts) {
    const result = parseSegment(part, pageCount);
    if (!result.ok) return result;
    for (const page of result.pages) pages.add(page);
  }

  return { ok: true, pages: [...pages].sort((a, b) => a - b) };
}

export interface PageRangeGroup {
  /** The raw comma-separated segment as typed, e.g. "7-10". */
  label: string;
  pages: number[];
}

export type ParsePageRangeGroupsResult =
  | { ok: true; groups: PageRangeGroup[] }
  | { ok: false; error: AppError };

/**
 * Same syntax and validation as parsePageRange, but keeps each
 * comma-separated segment as its own group instead of flattening them,
 * for "split each part into its own file" instead of "merge them all".
 */
export function parsePageRangeGroups(input: string, pageCount: number): ParsePageRangeGroupsResult {
  const parts = splitIntoParts(input);
  if (parts.length === 0) {
    return { ok: false, error: errors.invalidPageRange(pageCount, "empty input") };
  }

  const groups: PageRangeGroup[] = [];
  for (const part of parts) {
    const result = parseSegment(part, pageCount);
    if (!result.ok) return result;
    groups.push({ label: part, pages: result.pages });
  }

  return { ok: true, groups };
}

/** Inverse of parsePageRange: a sorted page-number list back to "2,4-5". */
export function formatPageRange(pages: number[]): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  if (sorted.length === 0) return "";

  const parts: string[] = [];
  let rangeStart = sorted[0];
  let rangeEnd = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current === rangeEnd + 1) {
      rangeEnd = current;
      continue;
    }
    parts.push(rangeStart === rangeEnd ? `${rangeStart}` : `${rangeStart}-${rangeEnd}`);
    if (current !== undefined) {
      rangeStart = current;
      rangeEnd = current;
    }
  }

  return parts.join(",");
}
