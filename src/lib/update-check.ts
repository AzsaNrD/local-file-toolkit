// Notify-only update check for the desktop app. It asks GitHub for the newest published release
// and compares the version number. Nothing is downloaded or installed; the person opens the
// release page and installs it themselves. This is the only request the app makes by itself,
// and it carries no file data. The person can turn it off on the home page.

export const RELEASES_URL = "https://github.com/AzsaNrD/local-file-toolkit/releases";
const LATEST_API = "https://api.github.com/repos/AzsaNrD/local-file-toolkit/releases/latest";

const CACHE_OK_MS = 6 * 60 * 60 * 1000;
// A failed check (usually offline) is retried sooner, so coming back online is noticed.
const CACHE_FAILED_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

export type UpdateStatus = "available" | "current" | "failed";

export interface UpdateCheckResult {
  status: UpdateStatus;
  latest: string | null;
  url: string;
}

export interface UpdateCheckResponse {
  /** True only inside the desktop app, which tells the server its own version. */
  desktop: boolean;
  current: string | null;
  /** Present only when the caller asked for a check (`?check=1`). */
  result: UpdateCheckResult | null;
}

export function parseVersion(text: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

let cache: { at: number; ttl: number; current: string; result: UpdateCheckResult } | null = null;

function failed(): UpdateCheckResult {
  return { status: "failed", latest: null, url: RELEASES_URL };
}

async function fetchLatest(current: string): Promise<UpdateCheckResult> {
  try {
    const response = await fetch(LATEST_API, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "local-file-toolkit-update-check" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return failed();
    const release: unknown = await response.json();
    if (typeof release !== "object" || release === null) return failed();
    const { tag_name: tag, html_url: htmlUrl } = release as { tag_name?: unknown; html_url?: unknown };
    if (typeof tag !== "string" || !parseVersion(tag)) return failed();
    // The link comes from the network, so only a link inside this project's releases is passed on.
    const url =
      typeof htmlUrl === "string" && htmlUrl.startsWith(`${RELEASES_URL}/`) ? htmlUrl : RELEASES_URL;
    const latest = tag.replace(/^v/, "");
    return { status: isNewer(latest, current) ? "available" : "current", latest, url };
  } catch {
    return failed();
  }
}

export async function checkForUpdate(current: string): Promise<UpdateCheckResult> {
  const now = Date.now();
  if (cache && cache.current === current && now - cache.at < cache.ttl) return cache.result;
  const result = await fetchLatest(current);
  cache = { at: now, ttl: result.status === "failed" ? CACHE_FAILED_MS : CACHE_OK_MS, current, result };
  return result;
}
