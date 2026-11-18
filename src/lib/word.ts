import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { probeBinaryVersion } from "@/lib/capability-probe";
import type { CapabilityStatus } from "@/lib/types";

let cachedCapability: CapabilityStatus | null = null;

/**
 * Word is driven through COM, so there is no binary to probe with a version flag (starting
 * WINWORD.EXE would open a window). Its registration in the registry is the signal instead:
 * `Word.Application.16` means Word 2016, 2019, 2021 or Microsoft 365. Windows only.
 */
export async function detectWordCapability(): Promise<CapabilityStatus> {
  if (cachedCapability) return cachedCapability;

  let status: CapabilityStatus = { available: false, version: null, path: null };
  if (process.platform === "win32") {
    const output = await probeBinaryVersion("reg", ["query", "HKCR\\Word.Application\\CurVer"]);
    const match = output ? /Word\.Application\.(\d+)/.exec(output) : null;
    if (match) status = { available: true, version: `${match[1]}.0`, path: "Word.Application" };
  }

  cachedCapability = status;
  return status;
}

// Exit codes the scripts use to tell the route what went wrong.
export const EXIT_APP_ALREADY_OPEN = 3;
export const EXIT_COULD_NOT_OPEN = 4;

/**
 * Word opens a PDF by reflowing it into paragraphs, but first shows a "Word will now convert
 * your PDF" notice that waits for a click even when Word is hidden. That notice is switched off
 * with a per-user registry value, set only for the length of the conversion and removed again
 * (unless it was already there). A Word that is already open is never touched: attaching to it
 * and calling Quit would close the person's own documents.
 */
const CONVERT_SCRIPT = `param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$PidPath,
  [Parameter(Mandatory = $true)][string]$OfficeVersion
)
$ErrorActionPreference = 'Stop'

# The previous file's Word can still be shutting down; give it a moment before deciding that
# someone else has it open.
$deadline = (Get-Date).AddSeconds(5)
while ((Get-Process -Name WINWORD -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 300 }
if (Get-Process -Name WINWORD -ErrorAction SilentlyContinue) { exit ${EXIT_APP_ALREADY_OPEN} }

$optionsKey = "HKCU:\\Software\\Microsoft\\Office\\$OfficeVersion\\Word\\Options"
$valueName = 'DisableConvertPdfWarning'
$hadValue = $null -ne (Get-ItemProperty -Path $optionsKey -Name $valueName -ErrorAction SilentlyContinue)
$word = $null
$doc = $null
try {
  if (-not $hadValue) {
    if (-not (Test-Path $optionsKey)) { New-Item -Path $optionsKey -Force | Out-Null }
    New-ItemProperty -Path $optionsKey -Name $valueName -Value 1 -PropertyType DWord -Force | Out-Null
  }
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $started = Get-Process -Name WINWORD -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($started) { Set-Content -LiteralPath $PidPath -Value $started.Id }
  try {
    # The last argument is a throwaway password: a locked PDF then fails instead of asking for one.
    $doc = $word.Documents.Open($InputPath, $false, $true, $false, 'x')
  } catch {
    exit ${EXIT_COULD_NOT_OPEN}
  }
  # 16 is wdFormatXMLDocument, a .docx.
  $doc.SaveAs2($OutputPath, 16)
} finally {
  # Each step stands alone: one failing must not skip the others, least of all the registry reset.
  try { if ($doc) { $doc.Close([ref]0) } } catch {}
  try { if ($word) { $word.Quit([ref]0) } } catch {}
  try { if (-not $hadValue) { Remove-ItemProperty -Path $optionsKey -Name $valueName -ErrorAction SilentlyContinue } } catch {}
}
`;

export type OfficeOutcome = "ok" | "timeout" | "app-already-open" | "could-not-open" | "failed";

function powershellPath(): string {
  const root = process.env.SystemRoot;
  return root ? path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell.exe";
}

/**
 * Runs a PowerShell script that drives an Office app and maps its exit code to an outcome.
 * The script must take a -PidPath parameter and write the Office process id there once the app
 * has started: Office is not a child of the script, so on a timeout that id is the only way to
 * stop a stuck app so it cannot block the next run.
 */
export async function runOfficeScript(
  workDir: string,
  script: string,
  scriptArgs: string[],
  timeoutMs: number,
): Promise<OfficeOutcome> {
  const scriptPath = path.join(workDir, "run.ps1");
  const pidPath = path.join(workDir, "office.pid");
  await writeFile(scriptPath, script, "utf8");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: OfficeOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    // Argument array, never a shell string (PRD 12.6).
    const child = spawn(
      powershellPath(),
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...scriptArgs, "-PidPath", pidPath],
      { windowsHide: true, stdio: "ignore" },
    );

    const timer = setTimeout(async () => {
      child.kill();
      try {
        const officePid = Number.parseInt((await readFile(pidPath, "utf8")).trim(), 10);
        if (Number.isInteger(officePid)) process.kill(officePid);
      } catch {
        // No pid file means the app never started.
      }
      finish("timeout");
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) finish("ok");
      else if (code === EXIT_APP_ALREADY_OPEN) finish("app-already-open");
      else if (code === EXIT_COULD_NOT_OPEN) finish("could-not-open");
      else finish("failed");
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish("failed");
    });
  });
}

// Office apps allow one automation session at a time, so every request waits its turn.
let queue: Promise<unknown> = Promise.resolve();

export function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

export function convertPdfWithWord(
  workDir: string,
  inputPath: string,
  outputPath: string,
  officeVersion: string,
  timeoutMs: number,
): Promise<OfficeOutcome> {
  return runExclusive(() =>
    runOfficeScript(
      workDir,
      CONVERT_SCRIPT,
      ["-InputPath", inputPath, "-OutputPath", outputPath, "-OfficeVersion", officeVersion],
      timeoutMs,
    ),
  );
}
