"use client";

import { useEffect, useState } from "react";
import { getToolBySlug } from "@/lib/tools";
import {
  fillPdfForm,
  readPdfForm,
  type FormFieldDescriptor,
  type FormValues,
} from "@/lib/pdf/form";
import type { AppError } from "@/lib/errors";
import { ToolShell, ToolStep } from "@/components/ToolShell";
import { FileDropzone } from "@/components/FileDropzone";
import { FileList, type FileListItem } from "@/components/FileList";
import { ResultPanel } from "@/components/ResultPanel";
import { ProgressBar } from "@/components/ProgressBar";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToolRun } from "@/hooks/useToolRun";

const tool = getToolBySlug("fill-form")!;

function defaultValues(fields: FormFieldDescriptor[]): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    if (field.kind === "text") values[field.name] = field.currentText ?? "";
    else if (field.kind === "checkbox") values[field.name] = field.checked ?? false;
    else if (field.kind === "radio") values[field.name] = field.selected?.[0] ?? "";
    else if (field.kind === "dropdown") values[field.name] = field.selected?.[0] ?? "";
    else if (field.kind === "optionList") values[field.name] = field.selected ?? [];
  }
  return values;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormFieldDescriptor;
  value: FormValues[string];
  onChange: (value: FormValues[string]) => void;
}) {
  if (field.kind === "text" && field.multiline) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">{field.name}</label>
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus-ring focus-visible:border-accent"
        />
      </div>
    );
  }

  if (field.kind === "text") {
    return (
      <Input
        label={field.name}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  if (field.kind === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        {field.name}
      </label>
    );
  }

  if (field.kind === "radio") {
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">{field.name}</legend>
        {(field.options ?? []).map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="radio"
              name={field.name}
              checked={value === option}
              onChange={() => onChange(option)}
              className="h-4 w-4 accent-accent"
            />
            {option}
          </label>
        ))}
      </fieldset>
    );
  }

  if (field.kind === "dropdown") {
    return (
      <Select
        label={field.name}
        options={[
          { value: "", label: "(none)" },
          ...(field.options ?? []).map((option) => ({ value: option, label: option })),
        ]}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  // "optionList": several values can be selected at once, shown as checkboxes.
  const selected = Array.isArray(value) ? value : [];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-foreground">{field.name}</legend>
      {(field.options ?? []).map((option) => (
        <label key={option} className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={selected.includes(option)}
            onChange={(e) =>
              onChange(e.target.checked ? [...selected, option] : selected.filter((v) => v !== option))
            }
            className="h-4 w-4 accent-accent"
          />
          {option}
        </label>
      ))}
    </fieldset>
  );
}

export default function FillFormPage() {
  const [items, setItems] = useState<FileListItem[]>([]);
  const [fields, setFields] = useState<FormFieldDescriptor[] | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [flatten, setFlatten] = useState(false);
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const run = useToolRun();

  const file = items[0]?.file ?? null;
  const isLoading = !!file && fields === null && !loadError;

  function clearFile() {
    run.reset();
    setItems([]);
    setFields(null);
    setValues({});
    setLoadError(null);
  }

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    readPdfForm(file)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setFields(result.info.fields);
          setValues(defaultValues(result.info.fields));
        } else {
          setLoadError(result.error);
        }
      })
      .catch(() => {
        if (!cancelled) setFields([]);
      });
    return () => {
      cancelled = true;
    };
  }, [file]);

  async function handleRun() {
    if (!file) return;
    await run.run(async () => {
      const result = await fillPdfForm(file, values, { flatten });
      if (!result.ok) throw result.error;
      return [result.output];
    });
  }

  function handleReset() {
    clearFile();
    run.reset();
  }

  if (run.status === "success") {
    return (
      <ToolShell tool={tool}>
        <ToolStep title="Result">
          <ResultPanel
            outputs={run.outputs}
            elapsedMs={run.elapsedMs}
            inputSizeBytes={file?.size}
            onReset={handleReset}
          />
        </ToolStep>
      </ToolShell>
    );
  }

  return (
    <ToolShell tool={tool} error={loadError}>
      <ToolStep title="Step 1: File">
        <div className="flex flex-col gap-4">
          <FileDropzone
            accept={tool.accept}
            multiple={false}
            maxFiles={1}
            maxFileSizeMB={tool.maxFileSizeMB}
            currentCount={items.length}
            onAccepted={(files) => {
              run.reset();
              setFields(null);
              setValues({});
              setLoadError(null);
              setItems(files.slice(0, 1).map((f) => ({ id: crypto.randomUUID(), file: f })));
            }}
            disabled={run.status === "running"}
          />
          <FileList items={items} onRemove={clearFile} onClearAll={clearFile} disabled={run.status === "running"} />
          {isLoading && <ProgressBar progress={null} label="Reading form fields..." />}
        </div>
      </ToolStep>

      {fields && fields.length === 0 && (
        <ToolStep title="No form fields found">
          <p className="text-sm text-muted-foreground">
            This PDF doesn&apos;t have any fillable form fields (text boxes, checkboxes,
            dropdowns). There&apos;s nothing here to fill in.
          </p>
        </ToolStep>
      )}

      {fields && fields.length > 0 && (
        <ToolStep title="Step 2: Fill in the form">
          <div className="flex flex-col gap-4">
            {fields.map((field) => (
              <FieldInput
                key={field.name}
                field={field}
                value={values[field.name]}
                onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
              />
            ))}
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={flatten}
                onChange={(e) => setFlatten(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Lock the form after filling (recipients can view but not edit the answers)
            </label>
          </div>
        </ToolStep>
      )}

      {run.status === "running" ? (
        <ToolStep title="Filling">
          <ProgressBar progress={null} label="Filling the form..." />
        </ToolStep>
      ) : (
        fields &&
        fields.length > 0 && (
          <Button type="button" onClick={handleRun} className="self-start">
            Fill form
          </Button>
        )
      )}
    </ToolShell>
  );
}
