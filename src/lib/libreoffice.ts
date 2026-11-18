import { makeCapabilityDetector } from "@/lib/capability-probe";

function platformDefaultPath(): string | null {
  switch (process.platform) {
    case "win32":
      // soffice.exe is a Windows GUI-subsystem binary: spawning it captures
      // exit code 0 but no stdout at all, which reads as "not available"
      // even when it's genuinely installed. soffice.com is LibreOffice's
      // own console-subsystem wrapper for exactly this case, and it prints
      // the version normally.
      return "C:\\Program Files\\LibreOffice\\program\\soffice.com";
    case "darwin":
      return "/Applications/LibreOffice.app/Contents/MacOS/soffice";
    case "linux":
      return "/usr/bin/soffice";
    default:
      return null;
  }
}

/** PRD 9.1: resolved once, cached for the process lifetime. */
export const detectLibreOfficeCapability = makeCapabilityDetector(
  () =>
    [process.env.LIBREOFFICE_PATH, platformDefaultPath(), "soffice"].filter(
      (candidate): candidate is string => Boolean(candidate),
    ),
  ["--version"],
);
