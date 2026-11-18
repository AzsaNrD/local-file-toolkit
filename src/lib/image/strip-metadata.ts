/**
 * Removes embedded metadata (EXIF, GPS, XMP, IPTC, comments) from JPEG, PNG,
 * and WebP files by rewriting the container, not by re-encoding the pixels,
 * so image quality is untouched. Pure byte handling: no DOM, no imports.
 */

export type MetadataImageType = "image/jpeg" | "image/png" | "image/webp";

export interface MetadataFindings {
  /** Plain-language labels for what was found, in file order, without duplicates. */
  items: string[];
  hasGps: boolean;
  /** JPEG only: a rotated phone photo keeps its orientation flag so it does not turn sideways. */
  keptOrientation: boolean;
}

export interface MetadataResult {
  type: MetadataImageType;
  /** Cleaned file bytes. Null when the call only inspected. */
  output: Uint8Array | null;
  findings: MetadataFindings;
}

/** Sniffs the real type from the first bytes instead of trusting the file extension. */
export function detectImageType(bytes: Uint8Array): MetadataImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Inspects (`write: false`) or cleans (`write: true`) an image. Returns null
 * for a type this tool does not handle, and throws `Error` for a file whose
 * structure is damaged.
 */
export function processImageMetadata(bytes: Uint8Array, write: boolean): MetadataResult | null {
  const type = detectImageType(bytes);
  if (!type) return null;
  const collector = new Collector();
  let output: Uint8Array | null;
  if (type === "image/jpeg") output = processJpeg(bytes, write, collector);
  else if (type === "image/png") output = processPng(bytes, write, collector);
  else output = processWebp(bytes, write, collector);
  return {
    type,
    output: write ? output : null,
    findings: {
      items: [...collector.items],
      hasGps: collector.hasGps,
      keptOrientation: collector.keptOrientation,
    },
  };
}

class Collector {
  items = new Set<string>();
  hasGps = false;
  keptOrientation = false;

  add(label: string): void {
    this.items.add(label);
  }
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let text = "";
  for (let i = start; i < start + length && i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

// ---------------------------------------------------------------- TIFF / EXIF

interface TiffInfo {
  orientation: number;
  hasGps: boolean;
}

/** Reads just the two facts this tool needs out of a TIFF block: orientation and whether GPS data exists. */
function readTiff(bytes: Uint8Array, tiffStart: number): TiffInfo {
  const info: TiffInfo = { orientation: 1, hasGps: false };
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const order = ascii(bytes, tiffStart, 2);
    if (order !== "II" && order !== "MM") return info;
    const little = order === "II";
    if (view.getUint16(tiffStart + 2, little) !== 42) return info;

    const ifd0 = tiffStart + view.getUint32(tiffStart + 4, little);
    const count = view.getUint16(ifd0, little);
    for (let i = 0; i < count; i++) {
      const entry = ifd0 + 2 + i * 12;
      const tag = view.getUint16(entry, little);
      if (tag === 0x0112) {
        info.orientation = view.getUint16(entry + 8, little);
      } else if (tag === 0x8825) {
        const gpsIfd = tiffStart + view.getUint32(entry + 8, little);
        info.hasGps = view.getUint16(gpsIfd, little) > 0;
      }
    }
  } catch {
    // A truncated or odd EXIF block: report what was read so far.
  }
  return info;
}

/** A one-tag EXIF block that carries only the orientation, so the photo still displays upright. */
function minimalOrientationSegment(orientation: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
}

// ----------------------------------------------------------------------- JPEG

function processJpeg(bytes: Uint8Array, write: boolean, found: Collector): Uint8Array | null {
  const kept: Uint8Array[] = [];
  let orientation = 1;
  let reachedScan = false;
  let pos = 2;

  while (pos + 2 <= bytes.length) {
    if (bytes[pos] !== 0xff) throw new Error("JPEG segment marker expected");
    const marker = bytes[pos + 1];

    if (marker === 0xff) {
      pos += 1; // padding byte
      continue;
    }
    if (marker === 0xd9) {
      if (write) kept.push(bytes.subarray(pos, pos + 2));
      reachedScan = true;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      if (write) kept.push(bytes.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }

    if (pos + 4 > bytes.length) throw new Error("JPEG segment truncated");
    const length = (bytes[pos + 2] << 8) | bytes[pos + 3];
    const end = pos + 2 + length;
    if (length < 2 || end > bytes.length) throw new Error("JPEG segment length invalid");

    if (marker === 0xda) {
      // Start of scan: everything from here on is image data and the closing marker.
      if (write) kept.push(bytes.subarray(pos));
      reachedScan = true;
      break;
    }

    const segment = bytes.subarray(pos, end);
    const payload = ascii(bytes, pos + 4, 29);
    let keep = true;

    if (marker === 0xe1) {
      keep = false;
      if (payload.startsWith("Exif\0\0")) {
        found.add("EXIF data (camera, date, settings)");
        const tiff = readTiff(bytes, pos + 10);
        if (tiff.hasGps) {
          found.hasGps = true;
          found.add("GPS location");
        }
        if (tiff.orientation > 1 && tiff.orientation <= 8) orientation = tiff.orientation;
      } else if (payload.startsWith("http://ns.adobe.com/xap/1.0/")) {
        found.add("XMP data");
      } else {
        found.add("Other embedded data");
      }
    } else if (marker === 0xe2) {
      // Keep the color profile; drop the multi-picture block, whose offsets break once anything moves.
      keep = payload.startsWith("ICC_PROFILE\0");
      if (!keep) found.add("Other embedded data");
    } else if (marker === 0xed) {
      keep = false;
      found.add("IPTC data (captions, credits)");
    } else if (marker === 0xfe) {
      keep = false;
      found.add("Comment");
    } else if (marker >= 0xe3 && marker <= 0xef && marker !== 0xee) {
      keep = false; // 0xee is Adobe color-transform info: needed to decode CMYK/YCCK correctly
      found.add("Other embedded data");
    }

    if (keep && write) kept.push(segment);
    pos = end;
  }

  if (!reachedScan) throw new Error("JPEG ended before image data");
  if (!write) {
    found.keptOrientation = orientation > 1;
    return null;
  }

  if (orientation > 1) {
    found.keptOrientation = true;
    const insertAt = kept.length > 0 && kept[0][1] === 0xe0 ? 1 : 0;
    kept.splice(insertAt, 0, minimalOrientationSegment(orientation));
  }
  return concat([bytes.subarray(0, 2), ...kept]);
}

// ------------------------------------------------------------------------ PNG

function processPng(bytes: Uint8Array, write: boolean, found: Collector): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let pos = 8;
  let sawEnd = false;

  while (pos + 12 <= bytes.length) {
    const length = view.getUint32(pos);
    const type = ascii(bytes, pos + 4, 4);
    const end = pos + 12 + length;
    if (end > bytes.length) throw new Error("PNG chunk truncated");

    let keep = true;
    if (type === "tEXt" || type === "zTXt") {
      keep = false;
      found.add("Text comments");
    } else if (type === "iTXt") {
      keep = false;
      found.add(ascii(bytes, pos + 8, 17) === "XML:com.adobe.xmp" ? "XMP data" : "Text comments");
    } else if (type === "eXIf") {
      keep = false;
      found.add("EXIF data (camera, date, settings)");
      if (readTiff(bytes, pos + 8).hasGps) {
        found.hasGps = true;
        found.add("GPS location");
      }
    } else if (type === "tIME") {
      keep = false;
      found.add("Modification time");
    }

    if (keep && write) kept.push(bytes.subarray(pos, end));
    pos = end;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }

  if (!sawEnd) throw new Error("PNG ended before IEND");
  return write ? concat(kept) : null;
}

// ----------------------------------------------------------------------- WebP

function processWebp(bytes: Uint8Array, write: boolean, found: Collector): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [];
  let pos = 12;

  while (pos + 8 <= bytes.length) {
    const fourcc = ascii(bytes, pos, 4);
    const size = view.getUint32(pos + 4, true);
    const padded = size + (size % 2);
    const end = pos + 8 + padded;
    if (pos + 8 + size > bytes.length) throw new Error("WebP chunk truncated");
    const chunkEnd = Math.min(end, bytes.length);

    if (fourcc === "EXIF") {
      found.add("EXIF data (camera, date, settings)");
      const hasPrefix = ascii(bytes, pos + 8, 6) === "Exif\0\0";
      if (readTiff(bytes, pos + 8 + (hasPrefix ? 6 : 0)).hasGps) {
        found.hasGps = true;
        found.add("GPS location");
      }
    } else if (fourcc === "XMP ") {
      found.add("XMP data");
    } else if (write) {
      let chunk = bytes.subarray(pos, chunkEnd);
      if (fourcc === "VP8X" && size >= 1) {
        // Clear the "has EXIF" (0x08) and "has XMP" (0x04) feature flags to match the removal.
        chunk = Uint8Array.from(chunk);
        chunk[8] &= ~0x0c;
      }
      kept.push(chunk);
    }
    pos = chunkEnd;
  }

  if (!write) return null;
  const body = concat(kept);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return concat([header, body]);
}
