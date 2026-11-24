"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import type { UpdateCheckResponse } from "@/lib/update-check";

// Shown only in the desktop app (the web version has no version to compare). The check is
// notify-only and can be turned off here; when it is off, no request is made to GitHub.
const PREF_KEY = "local-file-toolkit:update-check";
const DISMISSED_KEY = "local-file-toolkit:update-dismissed";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice still applies until the page closes.
  }
}

async function fetchUpdateInfo(check: boolean): Promise<UpdateCheckResponse | null> {
  try {
    const response = await fetch(`/api/update-check?check=${check ? 1 : 0}`);
    return response.ok ? ((await response.json()) as UpdateCheckResponse) : null;
  } catch {
    // Server stopped or offline: say nothing.
    return null;
  }
}

const textButton =
  "inline-flex min-h-11 items-center rounded-md underline underline-offset-2 hover:text-accent focus-ring";

export function UpdateNotice() {
  const [response, setResponse] = useState<UpdateCheckResponse | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [dismissed, setDismissed] = useState("");

  useEffect(() => {
    // The saved choice decides whether any request is made at all, so it is read before the first one.
    const on = readStorage(PREF_KEY) !== "off";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(on);
    setDismissed(readStorage(DISMISSED_KEY) ?? "");
    void fetchUpdateInfo(on).then((info) => {
      if (info) setResponse(info);
    });
  }, []);

  if (!response?.desktop) return null;

  const result = enabled ? response.result : null;
  const latest = result?.status === "available" ? result.latest : null;
  const releaseUrl = result?.url ?? "";
  const showBanner = latest !== null && dismissed !== latest;

  let status = `v${response.current}`;
  if (!enabled) status += " · Update check is off";
  else if (latest !== null && !showBanner) status += ` · Version ${latest} available`;
  else if (result?.status === "current") status += " · Up to date";
  else if (result?.status === "failed") status += " · Could not check for updates";

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    writeStorage(PREF_KEY, next ? null : "off");
    void fetchUpdateInfo(next).then((info) => {
      if (info) setResponse(info);
    });
  }

  function dismiss() {
    if (latest === null) return;
    setDismissed(latest);
    writeStorage(DISMISSED_KEY, latest);
  }

  return (
    <div className="flex flex-col gap-3">
      {showBanner && (
        <div
          role="status"
          className="animate-result-in flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-muted p-3 text-sm text-foreground"
        >
          <Info aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
          <p className="min-w-0 flex-1 basis-56">
            Version {latest} is available. You have {response.current}.
          </p>
          <a
            href={releaseUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-md border border-border-strong bg-surface px-4 text-sm font-medium text-foreground hover:border-accent hover:text-accent focus-ring"
          >
            View release
          </a>
          <button type="button" onClick={dismiss} className={`${textButton} px-2`}>
            Not now
          </button>
        </div>
      )}
      <p className="flex flex-wrap items-center gap-x-3 font-mono text-xs text-muted-foreground">
        <span>{status}</span>
        {latest !== null && !showBanner && (
          <a href={releaseUrl} target="_blank" rel="noreferrer" className={textButton}>
            View release
          </a>
        )}
        <button type="button" onClick={toggle} className={textButton}>
          {enabled ? "Turn off update check" : "Turn on update check"}
        </button>
      </p>
    </div>
  );
}
