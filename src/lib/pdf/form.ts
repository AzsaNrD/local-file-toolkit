import { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from "pdf-lib";
import { loadPdf, basenameOf, savePdfAsOutputFile } from "./load";
import type { AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export type FormFieldKind = "text" | "checkbox" | "radio" | "dropdown" | "optionList";

export interface FormFieldDescriptor {
  name: string;
  kind: FormFieldKind;
  /** "text" only. */
  multiline?: boolean;
  currentText?: string;
  /** "checkbox" only. */
  checked?: boolean;
  /** "radio" | "dropdown" | "optionList": the choices the field itself defines. */
  options?: string[];
  /** "radio" | "dropdown" | "optionList": already-selected values. */
  selected?: string[];
}

export interface FormInfo {
  fields: FormFieldDescriptor[];
}

export type ReadFormResult = { ok: true; info: FormInfo } | { ok: false; error: AppError };

/**
 * Not in the original 11 tools: reads a PDF's AcroForm fields (text boxes,
 * checkboxes, radio groups, dropdowns, option lists) into a plain
 * descriptor list, so a page can build inputs for them without knowing
 * pdf-lib's field classes. Buttons and signature fields are left out: they
 * aren't data a person fills in.
 */
export async function readPdfForm(file: File): Promise<ReadFormResult> {
  const bytes = await file.arrayBuffer();
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { doc } = loaded;

  const fields: FormFieldDescriptor[] = [];
  for (const field of doc.getForm().getFields()) {
    const name = field.getName();
    if (field instanceof PDFTextField) {
      fields.push({ name, kind: "text", multiline: field.isMultiline(), currentText: field.getText() });
    } else if (field instanceof PDFCheckBox) {
      fields.push({ name, kind: "checkbox", checked: field.isChecked() });
    } else if (field instanceof PDFRadioGroup) {
      const selected = field.getSelected();
      fields.push({ name, kind: "radio", options: field.getOptions(), selected: selected ? [selected] : [] });
    } else if (field instanceof PDFDropdown) {
      fields.push({ name, kind: "dropdown", options: field.getOptions(), selected: field.getSelected() });
    } else if (field instanceof PDFOptionList) {
      fields.push({ name, kind: "optionList", options: field.getOptions(), selected: field.getSelected() });
    }
  }

  return { ok: true, info: { fields } };
}

/** One entry per field name; a checkbox's value is a boolean, everything else a string (or string[] for multi-select). */
export type FormFieldValue = string | string[] | boolean;
export type FormValues = Record<string, FormFieldValue>;

export interface FillFormOptions {
  /** Bakes the values into the page content and removes the fields' interactivity. */
  flatten: boolean;
}

export type FillFormResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

export async function fillPdfForm(
  file: File,
  values: FormValues,
  options: FillFormOptions,
): Promise<FillFormResult> {
  const bytes = await file.arrayBuffer();
  const loaded = await loadPdf(bytes);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { doc } = loaded;
  const form = doc.getForm();

  for (const field of form.getFields()) {
    const name = field.getName();
    if (!(name in values)) continue;
    const value = values[name];

    try {
      if (field instanceof PDFTextField) {
        field.setText(typeof value === "string" ? value : "");
      } else if (field instanceof PDFCheckBox) {
        if (value) field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup) {
        if (typeof value === "string" && value) field.select(value);
      } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        const selection = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
        if (selection.length > 0) field.select(selection);
      }
    } catch {
      // A single malformed field (e.g. a read-only widget pdf-lib still
      // lists) shouldn't fail the whole form; its value is just left as-is.
    }
  }

  if (options.flatten) form.flatten();

  const output = await savePdfAsOutputFile(doc, `${basenameOf(file.name)}-filled.pdf`);
  return { ok: true, output };
}
