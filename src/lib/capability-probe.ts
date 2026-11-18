import { spawn } from "node:child_process";
import type { CapabilityStatus } from "@/lib/types";

/**
 * Shared by every external-binary capability (LibreOffice, Ghostscript):
 * spawn it with a version flag, give it 5s, and treat anything other than a
 * clean exit-0-with-output as "not available". Route Handler files may only
 * export the recognised HTTP method names, so this can't live inside a
 * route.ts and be imported by another route.
 */
export function probeBinaryVersion(binary: string, versionArgs: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawn(binary, versionArgs);
    } catch {
      finish(null);
      return;
    }

    const timeout = setTimeout(() => {
      child.kill();
      finish(null);
    }, 5000);

    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", () => {
      clearTimeout(timeout);
      finish(null);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      finish(code === 0 && output.trim().length > 0 ? output.trim() : null);
    });
  });
}

/**
 * Tries each candidate binary in order, returning the first one that
 * responds to its version flag. Cached for the process lifetime (PRD 9.1's
 * pattern, generalised): the result never changes without a restart.
 */
export function makeCapabilityDetector(
  candidates: () => string[],
  versionArgs: string[],
): () => Promise<CapabilityStatus> {
  let cached: CapabilityStatus | null = null;

  return async function detect(): Promise<CapabilityStatus> {
    if (cached) return cached;

    for (const candidate of candidates()) {
      const version = await probeBinaryVersion(candidate, versionArgs);
      if (version) {
        cached = { available: true, version, path: candidate };
        return cached;
      }
    }

    cached = { available: false, version: null, path: null };
    return cached;
  };
}
