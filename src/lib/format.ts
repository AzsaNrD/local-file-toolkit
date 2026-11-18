const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  const decimals = exponent === 0 ? 0 : value < 10 ? 2 : 1;
  const trimmed = value.toFixed(decimals).replace(/\.0+$/, "");
  return `${trimmed} ${BYTE_UNITS[exponent]}`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(totalSeconds < 10 ? 1 : 0)} s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

/** Signed percentage change from `beforeBytes` to `afterBytes`, e.g. "-42%". */
export function formatPercentChange(beforeBytes: number, afterBytes: number): string {
  if (!Number.isFinite(beforeBytes) || beforeBytes <= 0) return "0%";
  const change = ((afterBytes - beforeBytes) / beforeBytes) * 100;
  const rounded = Math.round(change);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

/** Splits "photo.jpeg" into { base: "photo", ext: ".jpeg" }. */
export function splitExtension(filename: string): { base: string; ext: string } {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0) return { base: filename, ext: "" };
  return { base: filename.slice(0, dot), ext: filename.slice(dot) };
}

/** e.g. "19 Sep 2026, 14:03", in the browser's own locale (NF6: no network calls). */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
