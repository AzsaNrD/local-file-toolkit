"use client";

import { useCapabilities } from "@/hooks/useCapabilities";
import type { Capability } from "@/lib/types";
import { Card } from "@/components/ui/Card";

export interface CapabilityGateProps {
  /** A list means any one of them is enough; the install help shown is for the last one. */
  capability: Capability | Capability[];
  children: React.ReactNode;
}

interface CapabilityCopy {
  name: string;
  message: string;
  /** Only for capabilities found by a file path that can be overridden. */
  envVar?: string;
  installSteps: { os: string; command: string }[];
}

// PRD 5.3's pattern (three install paths shown together, since the client
// can't reliably tell the user's OS from inside the browser sandbox),
// generalised to cover every gated capability, not just LibreOffice.
const CAPABILITY_COPY: Record<Capability, CapabilityCopy> = {
  libreoffice: {
    name: "LibreOffice",
    message: "LibreOffice is not installed on this computer, so Office conversion is turned off.",
    envVar: "LIBREOFFICE_PATH",
    installSteps: [
      { os: "Windows", command: "Download and run the installer from libreoffice.org" },
      { os: "macOS", command: "brew install --cask libreoffice" },
      { os: "Linux (Debian/Ubuntu)", command: "sudo apt install libreoffice" },
    ],
  },
  ghostscript: {
    name: "Ghostscript",
    message: "Ghostscript is not installed on this computer, so PDF compression is turned off.",
    envVar: "GHOSTSCRIPT_PATH",
    installSteps: [
      { os: "Windows", command: "Download and run the installer from ghostscript.com" },
      { os: "macOS", command: "brew install ghostscript" },
      { os: "Linux (Debian/Ubuntu)", command: "sudo apt install ghostscript" },
    ],
  },
  word: {
    name: "Microsoft Word",
    message: "Microsoft Word is not installed on this computer, so PDF to Word is turned off.",
    installSteps: [
      { os: "Windows", command: "Install Microsoft Word (part of Microsoft 365 or Office 2016 and newer)" },
      { os: "macOS and Linux", command: "Not available: this tool drives Word through Windows only" },
    ],
  },
};

export function CapabilityGate({ capability, children }: CapabilityGateProps) {
  const { capabilities, loading } = useCapabilities();

  if (loading) {
    return <p className="text-sm text-muted-foreground">Checking what&apos;s available on this computer...</p>;
  }

  const wanted = Array.isArray(capability) ? capability : [capability];
  if (wanted.some((name) => capabilities[name].available)) {
    return <>{children}</>;
  }

  const copy = CAPABILITY_COPY[wanted[wanted.length - 1]];

  return (
    <Card role="status" className="flex flex-col gap-3">
      <p className="text-sm font-medium text-foreground">{copy.message}</p>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {copy.installSteps.map((step) => (
          <li key={step.os}>
            <span className="font-medium text-foreground">{step.os}:</span>{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{step.command}</code>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        After installing, reload this page.
        {copy.envVar && (
          <>
            {" "}
            If {copy.name} is in a non-default location, set the{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">{copy.envVar}</code> environment variable
            and restart the app.
          </>
        )}
      </p>
    </Card>
  );
}
