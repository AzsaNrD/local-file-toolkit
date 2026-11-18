import { basenameOf, loadPdf, savePdfAsOutputFile } from "./load";
import { errors, type AppError } from "@/lib/errors";
import type { OutputFile } from "@/lib/types";

export interface CropMargins {
  /** Points to trim from each edge as the page is seen on screen. */
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type CropResult = { ok: true; output: OutputFile } | { ok: false; error: AppError };

// Anything smaller than this is not a usable page.
const MIN_SIDE_PT = 20;

/**
 * The margins are given as the page looks to a reader. A page stored with a 90 or 270
 * degree rotation has its edges swapped in the file, so each visual edge is mapped back
 * to the stored edge it came from before the box is cut.
 */
export function toStoredMargins(visual: CropMargins, rotation: number): CropMargins {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { left: visual.top, top: visual.right, right: visual.bottom, bottom: visual.left };
    case 180:
      return { top: visual.bottom, bottom: visual.top, left: visual.right, right: visual.left };
    case 270:
      return { right: visual.top, top: visual.left, left: visual.bottom, bottom: visual.right };
    default:
      return visual;
  }
}

/** Size of the first page as a reader sees it, in points. */
export async function readFirstPageSize(
  file: File,
): Promise<{ ok: true; widthPt: number; heightPt: number } | { ok: false; error: AppError }> {
  const loaded = await loadPdf(await file.arrayBuffer());
  if (!loaded.ok) return loaded;
  const page = loaded.doc.getPage(0);
  const box = page.getCropBox();
  const turned = page.getRotation().angle % 180 !== 0;
  return {
    ok: true,
    widthPt: turned ? box.height : box.width,
    heightPt: turned ? box.width : box.height,
  };
}

/**
 * Sets each page's visible area to the page minus the margins. The content outside stays
 * in the file, only hidden, so this is for tidying a page and not for removing anything private.
 */
export async function cropPdf(file: File, margins: CropMargins): Promise<CropResult> {
  const loaded = await loadPdf(await file.arrayBuffer());
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { doc } = loaded;

  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const stored = toStoredMargins(margins, page.getRotation().angle);
    const box = page.getCropBox();
    const width = box.width - stored.left - stored.right;
    const height = box.height - stored.top - stored.bottom;
    if (width < MIN_SIDE_PT || height < MIN_SIDE_PT) {
      return {
        ok: false,
        error: errors.invalidInput(
          `The margins leave almost nothing of page ${i + 1}. Use smaller margins.`,
        ),
      };
    }
    const x = box.x + stored.left;
    const y = box.y + stored.bottom;
    page.setCropBox(x, y, width, height);
    // Some viewers and printers read the media box only.
    page.setMediaBox(x, y, width, height);
  }

  const output = await savePdfAsOutputFile(doc, `${basenameOf(file.name)}-cropped.pdf`);
  return { ok: true, output };
}
