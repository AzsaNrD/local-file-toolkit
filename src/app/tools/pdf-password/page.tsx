"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import { errors, toAppError, type AppError } from "@/lib/errors";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { CapabilityGate } from "@/components/CapabilityGate";
import { ProgressBar } from "@/components/ProgressBar";
import { ResultPanel } from "@/components/ResultPanel";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";
import type { OutputFile } from "@/lib/types";

const tool = getToolBySlug("pdf-password")!;

type Action = "protect" | "unlock";

const MAX_NEW_PASSWORD_LENGTH = 32;
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

async function processOneFile(
  file: File,
  action: Action,
  password: string,
): Promise<{ ok: true; output: OutputFile } | { ok: false; error: AppError }> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("action", action);
    formData.append("password", password);
    const response = await fetch("/api/convert/pdf-password", { method: "POST", body: formData });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return {
        ok: false,
        error: body?.code ? (body as AppError) : errors.conversionFailed(`HTTP ${response.status}`),
      };
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    const suffix = action === "protect" ? "protected" : "unlocked";
    const name = match?.[1] ?? `${file.name.replace(/\.pdf$/i, "")}-${suffix}.pdf`;

    return { ok: true, output: { name, blob, sizeBytes: blob.size, mimeType: "application/pdf" } };
  } catch (thrown) {
    return { ok: false, error: toAppError(thrown) };
  }
}

export default function PdfPasswordPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [action, setAction] = useState<Action>("protect");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const run = useToolRun();

  function handleAccepted(files: File[]) {
    if (run.status === "error") run.reset();
    setItems((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  function handleRemove(id: string) {
    if (run.status === "error") run.reset();
    setItems((current) => current.filter((item) => item.id !== id));
  }

  const inputSizeBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  // Inline checks shown next to the field, so the button never fails silently.
  let passwordError: string | undefined;
  let confirmError: string | undefined;
  if (action === "protect") {
    if (password.length > MAX_NEW_PASSWORD_LENGTH) {
      passwordError = `Use ${MAX_NEW_PASSWORD_LENGTH} characters or fewer.`;
    } else if (!PRINTABLE_ASCII.test(password)) {
      passwordError = "Use letters, numbers, and common symbols only.";
    }
    if (confirm.length > 0 && confirm !== password) confirmError = "The passwords do not match.";
  }
  const passwordReady =
    password.length > 0 &&
    !passwordError &&
    (action === "unlock" || (confirm === password && confirm.length > 0));
  const canRun = items.length > 0 && passwordReady;

  async function handleRun() {
    await run.run(async (setProgress) => {
      const outputs: OutputFile[] = [];
      const failures: string[] = [];

      // Sequential, same caution as compress-pdf: one Ghostscript process at a time.
      for (let i = 0; i < items.length; i++) {
        setProgress(
          items.length === 1 ? null : (i / items.length) * 100,
          items.length > 1 ? `File ${i + 1} of ${items.length} · ${items[i].file.name}` : items[i].file.name,
        );
        const result = await processOneFile(items[i].file, action, password);
        if (result.ok) {
          outputs.push(result.output);
        } else {
          failures.push(`${items[i].file.name}: ${result.error.message}`);
        }
        setProgress(((i + 1) / items.length) * 100);
      }

      for (const failure of failures) toast.error(failure);

      if (outputs.length === 0) {
        throw errors.conversionFailed("every file in the batch failed");
      }
      return outputs;
    });
  }

  function handleReset() {
    setItems([]);
    setPassword("");
    setConfirm("");
    run.reset();
  }

  if (run.status === "success") {
    return (
      <ToolShell tool={tool}>
        <ToolStep title="Result">
          <ResultPanel
            outputs={run.outputs}
            elapsedMs={run.elapsedMs}
            inputSizeBytes={inputSizeBytes}
            zipFilename={action === "protect" ? "protected-pdfs.zip" : "unlocked-pdfs.zip"}
            onReset={handleReset}
          />
        </ToolStep>
      </ToolShell>
    );
  }

  const running = run.status === "running";

  return (
    <ToolShell tool={tool} error={run.status === "error" ? run.error : null}>
      <CapabilityGate capability="ghostscript">
        <ToolStep title="Step 1: Files">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted p-3 text-sm text-foreground">
              <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <p>
                This tool sends the file to the local converter running on this computer. It does
                not leave your machine.
              </p>
            </div>
            <FileDropzone
              accept={tool.accept}
              multiple={tool.multiple}
              maxFiles={tool.maxFiles}
              maxFileSizeMB={tool.maxFileSizeMB}
              currentCount={items.length}
              onAccepted={handleAccepted}
              disabled={running}
            />
            <FileList
              items={items}
              onRemove={handleRemove}
              onClearAll={() => {
                run.reset();
                setItems([]);
              }}
              disabled={running}
            />
          </div>
        </ToolStep>

        {items.length > 0 && (
          <ToolStep title="Step 2: Password">
            <div className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2" disabled={running}>
                <legend className="mb-1 text-sm font-medium text-foreground">What to do</legend>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="password-action"
                    checked={action === "protect"}
                    onChange={() => setAction("protect")}
                    className="h-4 w-4 accent-accent"
                  />
                  Add a password
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name="password-action"
                    checked={action === "unlock"}
                    onChange={() => setAction("unlock")}
                    className="h-4 w-4 accent-accent"
                  />
                  Remove a password I know
                </label>
              </fieldset>

              <Input
                label={action === "protect" ? "New password" : "Current password"}
                type={showPassword ? "text" : "password"}
                autoComplete={action === "protect" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={passwordError}
                hint={
                  action === "protect"
                    ? `Up to ${MAX_NEW_PASSWORD_LENGTH} characters. Anyone opening the file will need it.`
                    : undefined
                }
                disabled={running}
              />
              {action === "protect" && (
                <Input
                  label="Repeat the password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  error={confirmError}
                  disabled={running}
                />
              )}
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(event) => setShowPassword(event.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Show password
              </label>

              <p className="text-sm text-muted-foreground">
                {action === "protect"
                  ? "Uses 128-bit RC4, the strongest encryption Ghostscript writes. It keeps casual readers out; for very sensitive files, use a tool that offers AES-256."
                  : "The file is rewritten without a password. Any digital signature it carried will no longer be valid. Nothing is remembered: the password is used once and discarded."}
              </p>
            </div>
          </ToolStep>
        )}

        {running ? (
          <ToolStep title={action === "protect" ? "Protecting" : "Unlocking"}>
            <ProgressBar progress={run.progress} label="Working on one PDF at a time..." detail={run.detail} />
          </ToolStep>
        ) : (
          items.length > 0 && (
            <Button type="button" disabled={!canRun} hint={action === "protect" ? "Enter the same password in both boxes." : "Enter the password."} onClick={handleRun} className="self-start">
              {action === "protect" ? "Protect" : "Unlock"} {items.length} file
              {items.length === 1 ? "" : "s"}
            </Button>
          )
        )}
      </CapabilityGate>
    </ToolShell>
  );
}
