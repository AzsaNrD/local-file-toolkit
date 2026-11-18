import { splitExtension } from "./format";

export type CaseMode = "keep" | "lower" | "upper" | "title";
export type SpaceMode = "keep" | "dash" | "underscore";
export type NumberPosition = "before" | "after";

export interface RenameOptions {
  /** Replaces the whole name (not the extension). Empty keeps each file's own name. */
  newBase: string;
  find: string;
  replaceWith: string;
  prefix: string;
  suffix: string;
  numbering: boolean;
  numberStart: number;
  /** Minimum digits, e.g. 3 gives 001. */
  numberPadding: number;
  numberPosition: NumberPosition;
  caseMode: CaseMode;
  spaces: SpaceMode;
  lowerCaseExtension: boolean;
}

export const DEFAULT_RENAME_OPTIONS: RenameOptions = {
  newBase: "",
  find: "",
  replaceWith: "",
  prefix: "",
  suffix: "",
  numbering: false,
  numberStart: 1,
  numberPadding: 2,
  numberPosition: "after",
  caseMode: "keep",
  spaces: "keep",
  lowerCaseExtension: false,
};

// Characters Windows will not accept in a file name; the other systems accept
// a subset, so removing these keeps the result valid everywhere.
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;

function titleCase(text: string): string {
  return text.toLowerCase().replace(/(^|[\s_-])(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase());
}

/** Builds one new file name. `index` is 0-based within the list. */
export function buildName(originalName: string, index: number, options: RenameOptions): string {
  const { base: originalBase, ext } = splitExtension(originalName);

  let base = options.newBase.trim() !== "" ? options.newBase : originalBase;
  if (options.find !== "") base = base.split(options.find).join(options.replaceWith);

  if (options.spaces === "dash") base = base.replace(/\s+/g, "-");
  if (options.spaces === "underscore") base = base.replace(/\s+/g, "_");

  if (options.caseMode === "lower") base = base.toLowerCase();
  if (options.caseMode === "upper") base = base.toUpperCase();
  if (options.caseMode === "title") base = titleCase(base);

  if (options.numbering) {
    const digits = String(Math.max(0, options.numberStart) + index).padStart(
      Math.min(Math.max(1, options.numberPadding), 8),
      "0",
    );
    // A custom base needs a separator before the number; when the number is the whole name it does not.
    base = options.numberPosition === "before" ? `${digits}-${base}` : `${base}-${digits}`;
  }

  base = `${options.prefix}${base}${options.suffix}`.replace(ILLEGAL, "").trim();
  // Windows silently drops trailing dots and spaces; leading dots would hide the file on macOS and Linux.
  base = base.replace(/[. ]+$/g, "").replace(/^\.+/, "");
  if (base === "") base = "file";

  const finalExt = options.lowerCaseExtension ? ext.toLowerCase() : ext;
  return `${base}${finalExt}`;
}

export interface RenamePlanEntry {
  original: string;
  renamed: string;
  /** True when two files ended up with the same name and this one was given a numeric tail. */
  deduplicated: boolean;
  unchanged: boolean;
}

/**
 * Names for the whole list. Two files that would collide get " (2)", " (3)" and so on,
 * comparing case-insensitively because Windows and macOS treat "A.txt" and "a.txt" as one file.
 */
export function planRename(names: string[], options: RenameOptions): RenamePlanEntry[] {
  const taken = new Set<string>();
  return names.map((original, index) => {
    const wanted = buildName(original, index, options);
    let candidate = wanted;
    let deduplicated = false;
    if (taken.has(candidate.toLowerCase())) {
      const { base, ext } = splitExtension(wanted);
      let counter = 2;
      do {
        candidate = `${base} (${counter})${ext}`;
        counter++;
      } while (taken.has(candidate.toLowerCase()));
      deduplicated = true;
    }
    taken.add(candidate.toLowerCase());
    return { original, renamed: candidate, deduplicated, unchanged: candidate === original };
  });
}
