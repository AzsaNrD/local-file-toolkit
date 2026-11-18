import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const destDir = join(projectRoot, "public");
await mkdir(destDir, { recursive: true });

async function copyInto(destSubdir, ...sourceParts) {
  const source = join(projectRoot, "node_modules", ...sourceParts);
  const filename = sourceParts[sourceParts.length - 1];
  const destFolder = destSubdir ? join(destDir, destSubdir) : destDir;
  await mkdir(destFolder, { recursive: true });
  const dest = join(destFolder, filename);
  await copyFile(source, dest);
  console.log(`copied ${filename} -> ${dest}`);
}

// PRD 12.1: pdf.js needs its worker file served locally.
await copyInto(null, "pdfjs-dist", "build", "pdf.worker.min.mjs");

// Not in the PRD, but the same problem: browser-image-compression's web
// worker calls importScripts() on an `options.libURL` that defaults to a
// jsdelivr CDN URL. Left unset, compress-image would silently phone home
// on every run, which breaks NF3/NF5/NF6 (no network for client tools, and
// the app must work fully offline). Serving our own copy and passing
// `libURL: "/browser-image-compression.js"` keeps it local.
await copyInto(null, "browser-image-compression", "dist", "browser-image-compression.js");

// Same problem again, this time for the OCR tool: tesseract.js defaults its
// worker, WASM core, and per-language trained data to jsdelivr CDN URLs.
// These are the "best_int" LSTM-only variants (the default engine, no
// legacy-model bloat) for English and Indonesian, self-hosted so OCR never
// phones home. corePath/langPath/workerPath in ocr.ts point at this folder.
await copyInto("tesseract", "tesseract.js", "dist", "worker.min.js");
await copyInto("tesseract", "tesseract.js-core", "tesseract-core-lstm.wasm.js");
await copyInto("tesseract", "tesseract.js-core", "tesseract-core-lstm.wasm");
await copyInto(
  "tesseract/lang-data",
  "@tesseract.js-data",
  "eng",
  "4.0.0_best_int",
  "eng.traineddata.gz",
);
await copyInto(
  "tesseract/lang-data",
  "@tesseract.js-data",
  "ind",
  "4.0.0_best_int",
  "ind.traineddata.gz",
);
