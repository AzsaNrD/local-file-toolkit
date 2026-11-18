import { probeBinaryVersion } from "@/lib/capability-probe";
import type { CapabilityStatus } from "@/lib/types";
import {
  EXIT_APP_ALREADY_OPEN,
  EXIT_COULD_NOT_OPEN,
  detectWordCapability,
  runExclusive,
  runOfficeScript,
  type OfficeOutcome,
} from "@/lib/word";

export type OfficeApp = "word" | "excel" | "powerpoint";

const EXTENSION_APP: Record<string, OfficeApp> = {
  ".doc": "word",
  ".docx": "word",
  ".odt": "word",
  ".rtf": "word",
  ".xls": "excel",
  ".xlsx": "excel",
  ".ods": "excel",
  ".csv": "excel",
  ".ppt": "powerpoint",
  ".pptx": "powerpoint",
  ".odp": "powerpoint",
};

/** The Office app that opens this file type, or null when the type is not one of theirs. */
export function officeAppFor(extension: string): OfficeApp | null {
  return EXTENSION_APP[extension] ?? null;
}

const PROG_ID: Record<Exclude<OfficeApp, "word">, string> = {
  excel: "Excel.Application",
  powerpoint: "PowerPoint.Application",
};

const cachedApps: Partial<Record<Exclude<OfficeApp, "word">, CapabilityStatus>> = {};

/** Same registry check as Word (see detectWordCapability), for the other two apps. */
export async function detectOfficeAppCapability(app: OfficeApp): Promise<CapabilityStatus> {
  if (app === "word") return detectWordCapability();

  const cached = cachedApps[app];
  if (cached) return cached;

  let status: CapabilityStatus = { available: false, version: null, path: null };
  if (process.platform === "win32") {
    const progId = PROG_ID[app];
    const output = await probeBinaryVersion("reg", ["query", `HKCR\\${progId}\\CurVer`]);
    const match = output ? new RegExp(`${progId.replace(".", "\\.")}\\.(\\d+)`).exec(output) : null;
    if (match) status = { available: true, version: `${match[1]}.0`, path: progId };
  }

  cachedApps[app] = status;
  return status;
}

/**
 * One script for all three apps. Each app is opened read-only, hidden where it allows,
 * with macros forced off (AutomationSecurity 3), and a throwaway password so a locked file
 * fails to open instead of waiting for someone to type one. An app that is already running is
 * never touched: attaching to it and calling Quit would close the person's own documents.
 */
const TO_PDF_SCRIPT = `param(
  [Parameter(Mandatory = $true)][string]$App,
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$PidPath
)
$ErrorActionPreference = 'Stop'

$processName = @{ word = 'WINWORD'; excel = 'EXCEL'; powerpoint = 'POWERPNT' }[$App]
# The previous file's app can still be shutting down; give it a moment before deciding that
# someone else has it open.
$deadline = (Get-Date).AddSeconds(5)
while ((Get-Process -Name $processName -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 300 }
if (Get-Process -Name $processName -ErrorAction SilentlyContinue) { exit ${EXIT_APP_ALREADY_OPEN} }

# Word and Excel lay pages out through the default printer. When that is an offline one (an
# unplugged USB printer) Word stalls for about fifteen seconds and Excel stops on a "Printer
# Setup" dialog. The virtual PDF printer is always there on Windows 10 and 11, so each app is
# pointed at it for this session only; the Windows default is untouched.
$devices = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Devices' -ErrorAction SilentlyContinue
$pdfPrinter = $devices.'Microsoft Print to PDF'
$pdfPrinterName = if ($pdfPrinter) { "Microsoft Print to PDF on $(($pdfPrinter -split ',')[1])" } else { $null }

$office = $null
$doc = $null
try {
  switch ($App) {
    'word' {
      $office = New-Object -ComObject Word.Application
      $office.Visible = $false
      $office.DisplayAlerts = 0
      $office.AutomationSecurity = 3
      if ($pdfPrinterName) { try { $office.ActivePrinter = $pdfPrinterName } catch {} }
    }
    'excel' {
      $office = New-Object -ComObject Excel.Application
      $office.Visible = $false
      $office.DisplayAlerts = $false
      $office.AutomationSecurity = 3
    }
    'powerpoint' {
      $office = New-Object -ComObject PowerPoint.Application
      $office.AutomationSecurity = 3
    }
  }
  $started = Get-Process -Name $processName -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($started) { Set-Content -LiteralPath $PidPath -Value $started.Id }

  try {
    switch ($App) {
      'word' { $doc = $office.Documents.Open($InputPath, $false, $true, $false, 'x') }
      'excel' { $doc = $office.Workbooks.Open($InputPath, 0, $true, [Type]::Missing, 'x') }
      'powerpoint' { $doc = $office.Presentations.Open($InputPath, $true, $true, $false) }
    }
  } catch {
    exit ${EXIT_COULD_NOT_OPEN}
  }

  switch ($App) {
    # 17 is wdExportFormatPDF, 0 is xlTypePDF, 32 is ppSaveAsPDF.
    'word' { $doc.ExportAsFixedFormat($OutputPath, 17) }
    'excel' {
      # Excel refuses the printer change until a workbook is open, hence it sits here.
      if ($pdfPrinterName) { try { $office.ActivePrinter = $pdfPrinterName } catch {} }
      $doc.ExportAsFixedFormat(0, $OutputPath)
    }
    'powerpoint' { $doc.SaveAs($OutputPath, 32) }
  }
} finally {
  # Each step stands alone: one failing must not skip the others.
  try {
    if ($doc) {
      switch ($App) {
        'word' { $doc.Close([ref]0) }
        'excel' { $doc.Close($false) }
        'powerpoint' { $doc.Close() }
      }
    }
  } catch {}
  try {
    if ($office) {
      if ($App -eq 'word') { $office.Quit([ref]0) } else { $office.Quit() }
    }
  } catch {}
}
`;

export function convertToPdfWithOffice(
  app: OfficeApp,
  workDir: string,
  inputPath: string,
  outputPath: string,
  timeoutMs: number,
): Promise<OfficeOutcome> {
  return runExclusive(() =>
    runOfficeScript(
      workDir,
      TO_PDF_SCRIPT,
      ["-App", app, "-InputPath", inputPath, "-OutputPath", outputPath],
      timeoutMs,
    ),
  );
}
