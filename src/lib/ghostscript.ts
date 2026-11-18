import { readdirSync } from "node:fs";
import path from "node:path";
import { makeCapabilityDetector } from "@/lib/capability-probe";

/**
 * The Windows Ghostscript installer does not add itself to PATH (unlike
 * LibreOffice), and its install directory is versioned
 * (`C:\Program Files\gs\gs10.08.0\bin\...`), so a fixed default path can't
 * work either. Instead, list what's actually under the known parent
 * directories and try each version's console binary directly.
 */
function windowsVersionedCandidates(): string[] {
  const roots = ["C:\\Program Files\\gs", "C:\\Program Files (x86)\\gs"];
  const candidates: string[] = [];

  for (const root of roots) {
    let entries: string[];
    try {
      // This scans a real Windows path at request time on the user's own
      // machine; it must never make Next's build tracer bundle the whole
      // filesystem tree, which is what an untraceable dynamic fs call
      // would otherwise trigger for a serverless/standalone output.
      entries = readdirSync(/* turbopackIgnore: true */ root);
    } catch {
      continue;
    }
    // Newest version first: "gs10.08.0" sorts correctly against "gs9.56.1"
    // often enough, but a plain reverse string sort is a reasonable
    // best-effort tiebreaker without a full semver parse.
    const versions = entries.filter((name) => /^gs\d/.test(name)).sort().reverse();
    for (const version of versions) {
      candidates.push(path.join(root, version, "bin", "gswin64c.exe"));
      candidates.push(path.join(root, version, "bin", "gswin32c.exe"));
    }
  }

  return candidates;
}

function platformCandidates(): string[] {
  switch (process.platform) {
    case "win32":
      // Versioned absolute paths first (the common case), bare names last
      // in case the user did put Ghostscript on PATH themselves.
      return [...windowsVersionedCandidates(), "gswin64c", "gswin32c"];
    case "darwin":
      return ["/opt/homebrew/bin/gs", "/usr/local/bin/gs", "gs"];
    case "linux":
      return ["/usr/bin/gs", "gs"];
    default:
      return ["gs"];
  }
}

/** Mirrors detectLibreOfficeCapability: resolved once, cached for the process lifetime. */
export const detectGhostscriptCapability = makeCapabilityDetector(
  () =>
    [process.env.GHOSTSCRIPT_PATH, ...platformCandidates()].filter(
      (candidate): candidate is string => Boolean(candidate),
    ),
  ["--version"],
);
