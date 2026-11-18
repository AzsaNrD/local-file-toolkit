/** Shared by watermark.ts and page-numbers.ts: both stamp content at one of the same 9 page anchors. */

export type PageAnchorPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const MARGIN_PT = 36;

export function hexToRgbUnit(hex: string): { r: number; g: number; b: number } {
  const value = parseInt(hex.replace("#", ""), 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

/** Anchor point for the content's bottom-left corner, before any rotation is applied. */
export function resolveAnchor(
  position: PageAnchorPosition,
  pageWidth: number,
  pageHeight: number,
  contentWidth: number,
  contentHeight: number,
): { x: number; y: number } {
  const [v, h] = position === "center" ? ["center", "center"] : position.split("-");

  const x =
    h === "left" ? MARGIN_PT : h === "right" ? pageWidth - MARGIN_PT - contentWidth : (pageWidth - contentWidth) / 2;
  const y =
    v === "top"
      ? pageHeight - MARGIN_PT - contentHeight
      : v === "bottom"
        ? MARGIN_PT
        : (pageHeight - contentHeight) / 2;

  return { x, y };
}
