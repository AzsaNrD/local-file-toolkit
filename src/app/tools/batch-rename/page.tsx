"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getToolBySlug } from "@/lib/tools";
import {
  DEFAULT_RENAME_OPTIONS,
  planRename,
  type CaseMode,
  type NumberPosition,
  type RenameOptions,
  type SpaceMode,
} from "@/lib/rename";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ResultPanel } from "@/components/ResultPanel";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToolRun } from "@/hooks/useToolRun";
import { useStoredState } from "@/hooks/useStoredState";
import type { OutputFile } from "@/lib/types";

const tool = getToolBySlug("batch-rename")!;

const CASE_OPTIONS: { value: CaseMode; label: string }[] = [
  { value: "keep", label: "Keep as is" },
  { value: "lower", label: "all lowercase" },
  { value: "upper", label: "ALL UPPERCASE" },
  { value: "title", label: "Each Word Capitalised" },
];
const SPACE_OPTIONS: { value: SpaceMode; label: string }[] = [
  { value: "keep", label: "Keep spaces" },
  { value: "dash", label: "Replace with -" },
  { value: "underscore", label: "Replace with _" },
];
const POSITION_OPTIONS: { value: NumberPosition; label: string }[] = [
  { value: "after", label: "After the name" },
  { value: "before", label: "Before the name" },
];

const PREVIEW_ROWS = 50;

export default function BatchRenamePage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [options, setOptions] = useState<RenameOptions>(DEFAULT_RENAME_OPTIONS);
  // The choices people repeat between sessions; the name text itself is specific to one batch.
  const [caseMode, setCaseMode] = useStoredState<CaseMode>("batch-rename.case", "keep", (value): value is CaseMode =>
    CASE_OPTIONS.some((option) => option.value === value),
  );
  const [spaces, setSpaces] = useStoredState<SpaceMode>("batch-rename.spaces", "keep", (value): value is SpaceMode =>
    SPACE_OPTIONS.some((option) => option.value === value),
  );
  const run = useToolRun();

  const effective = useMemo(() => ({ ...options, caseMode, spaces }), [options, caseMode, spaces]);
  const plan = useMemo(() => planRename(items.map((item) => item.file.name), effective), [items, effective]);
  const changedCount = plan.filter((entry) => !entry.unchanged).length;
  const duplicates = plan.filter((entry) => entry.deduplicated).length;

  function set<K extends keyof RenameOptions>(key: K, value: RenameOptions[K]) {
    setOptions((current) => ({ ...current, [key]: value }));
  }

  function handleReset() {
    run.reset();
    setItems([]);
    setOptions(DEFAULT_RENAME_OPTIONS);
  }

  async function handleRun() {
    await run.run(async () => {
      const outputs: OutputFile[] = items.map((item, index) => ({
        name: plan[index].renamed,
        blob: item.file,
        sizeBytes: item.file.size,
        mimeType: item.file.type || "application/octet-stream",
      }));
      return outputs;
    });
  }

  if (run.status === "success") {
    return (
      <ToolShell tool={tool}>
        <ToolStep title="Result">
          <ResultPanel
            outputs={run.outputs}
            elapsedMs={null}
            zipFilename="renamed-files.zip"
            onReset={handleReset}
          />
        </ToolStep>
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={tool} error={run.status === "error" ? run.error : null}>
      <ToolStep title="Step 1: Files">
        <div className="flex flex-col gap-4">
          <FileDropzone
            accept={tool.accept}
            multiple
            maxFiles={tool.maxFiles}
            maxFileSizeMB={tool.maxFileSizeMB}
            currentCount={items.length}
            onAccepted={(files) =>
              setItems((current) => [...current, ...files.map((f) => ({ id: crypto.randomUUID(), file: f }))])
            }
          />
          <FileList
            items={items}
            reorderable
            onReorder={setItems}
            onRemove={(id) => setItems((current) => current.filter((item) => item.id !== id))}
            onClearAll={() => setItems([])}
          />
          {items.length > 1 && (
            <p className="text-sm text-muted-foreground">
              Numbers follow the order of this list. Use the arrows to change it.
            </p>
          )}
        </div>
      </ToolStep>

      {items.length > 0 && (
        <>
          <ToolStep title="Step 2: Rules">
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="New name for every file"
                  hint="Leave empty to keep each file's own name. The extension is never changed."
                  value={options.newBase}
                  onChange={(event) => set("newBase", event.target.value)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Add before" value={options.prefix} onChange={(event) => set("prefix", event.target.value)} />
                  <Input label="Add after" value={options.suffix} onChange={(event) => set("suffix", event.target.value)} />
                </div>
                <Input label="Find" value={options.find} onChange={(event) => set("find", event.target.value)} />
                <Input
                  label="Replace with"
                  value={options.replaceWith}
                  onChange={(event) => set("replaceWith", event.target.value)}
                />
                <Select
                  label="Letter case"
                  options={CASE_OPTIONS}
                  value={caseMode}
                  onChange={(event) => setCaseMode(event.target.value as CaseMode)}
                />
                <Select
                  label="Spaces"
                  options={SPACE_OPTIONS}
                  value={spaces}
                  onChange={(event) => setSpaces(event.target.value as SpaceMode)}
                />
              </div>

              <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
                <legend className="px-1 text-sm font-medium text-foreground">Numbering</legend>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={options.numbering}
                    onChange={(event) => set("numbering", event.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  Add a running number
                </label>
                {options.numbering && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Input
                      label="Start at"
                      type="number"
                      min={0}
                      value={options.numberStart}
                      onChange={(event) => set("numberStart", Math.max(0, Math.floor(Number(event.target.value)) || 0))}
                      className="font-mono tabular-nums"
                    />
                    <Input
                      label="Digits"
                      type="number"
                      min={1}
                      max={8}
                      value={options.numberPadding}
                      onChange={(event) =>
                        set("numberPadding", Math.min(8, Math.max(1, Math.floor(Number(event.target.value)) || 1)))
                      }
                      className="font-mono tabular-nums"
                    />
                    <Select
                      label="Position"
                      options={POSITION_OPTIONS}
                      value={options.numberPosition}
                      onChange={(event) => set("numberPosition", event.target.value as NumberPosition)}
                    />
                  </div>
                )}
              </fieldset>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={options.lowerCaseExtension}
                  onChange={(event) => set("lowerCaseExtension", event.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Make extensions lowercase (.JPG becomes .jpg)
              </label>
            </div>
          </ToolStep>

          <ToolStep title="Preview">
            <div className="flex flex-col gap-3">
              <p role="status" className="font-mono text-sm tabular-nums text-muted-foreground">
                {changedCount} of {items.length} file{items.length === 1 ? "" : "s"} will change
                {duplicates > 0 ? ` · ${duplicates} got a number added to avoid a clash` : ""}
              </p>
              <ul className="flex flex-col gap-1.5">
                {plan.slice(0, PREVIEW_ROWS).map((entry, index) => (
                  <li
                    key={index}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 break-all text-muted-foreground">{entry.original}</span>
                    <ArrowRight aria-label="becomes" className="h-4 w-4 shrink-0 text-accent" />
                    <span className="min-w-0 break-all font-mono text-foreground">{entry.renamed}</span>
                  </li>
                ))}
              </ul>
              {plan.length > PREVIEW_ROWS && (
                <p className="text-sm text-muted-foreground">
                  And {plan.length - PREVIEW_ROWS} more, renamed by the same rules.
                </p>
              )}
            </div>
          </ToolStep>

          <Button type="button" disabled={changedCount === 0} hint="No names would change yet. Edit the pattern or the names." onClick={handleRun} className="self-start">
            {changedCount === 0 ? "Nothing to rename yet" : `Rename ${changedCount} file${changedCount === 1 ? "" : "s"}`}
          </Button>
        </>
      )}
    </ToolShell>
  );
}
