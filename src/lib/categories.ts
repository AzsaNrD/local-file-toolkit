import type { ToolCategory } from "./types";

/** Display order everywhere categories are listed (home grid, filter, tool switcher). */
export const CATEGORY_ORDER: ToolCategory[] = ["pdf", "image", "convert", "utility"];

/** Section headings (PRD 10.1). */
export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  pdf: "PDF Tools",
  image: "Image Tools",
  convert: "Convert",
  utility: "File Tools",
};

/** Short labels for the filter buttons. */
export const CATEGORY_SHORT_LABELS: Record<ToolCategory, string> = {
  pdf: "PDF",
  image: "Image",
  convert: "Convert",
  utility: "Files",
};

export type CategoryFilterValue = ToolCategory | "all";

export function parseCategoryFilter(value: string | null): CategoryFilterValue {
  return CATEGORY_ORDER.find((category) => category === value) ?? "all";
}
