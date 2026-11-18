/**
 * Section 5 fixes the dependency list and it has no zip library, so
 * downloadAsZip below builds a minimal, spec-compliant ZIP (stored /
 * uncompressed entries) by hand instead of adding jszip or similar.
 */

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export interface ZipEntry {
  name: string;
  data: ArrayBuffer;
}

export async function downloadAsZip(files: { name: string; blob: Blob }[], zipFilename: string): Promise<void> {
  const entries: ZipEntry[] = await Promise.all(
    files.map(async (file) => ({ name: file.name, data: await file.blob.arrayBuffer() })),
  );
  const zipBlob = createZipBlob(entries);
  triggerDownload(zipBlob, zipFilename);
}

export function createZipBlob(entries: ZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = dosDateTimeNow();
  const localChunks: Uint8Array<ArrayBuffer>[] = [];
  const centralChunks: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = new Uint8Array(entry.data);
    const crc = crc32(data);

    const localHeader = new DataView(new ArrayBuffer(30));
    localHeader.setUint32(0, 0x04034b50, true);
    localHeader.setUint16(4, 20, true); // version needed
    localHeader.setUint16(6, 0x0800, true); // UTF-8 filename flag
    localHeader.setUint16(8, 0, true); // stored, no compression
    localHeader.setUint16(10, dosTime, true);
    localHeader.setUint16(12, dosDate, true);
    localHeader.setUint32(14, crc, true);
    localHeader.setUint32(18, data.byteLength, true);
    localHeader.setUint32(22, data.byteLength, true);
    localHeader.setUint16(26, nameBytes.byteLength, true);
    localHeader.setUint16(28, 0, true); // extra field length

    localChunks.push(new Uint8Array(localHeader.buffer), nameBytes, data);

    const centralHeader = new DataView(new ArrayBuffer(46));
    centralHeader.setUint32(0, 0x02014b50, true);
    centralHeader.setUint16(4, 20, true); // version made by
    centralHeader.setUint16(6, 20, true); // version needed
    centralHeader.setUint16(8, 0x0800, true);
    centralHeader.setUint16(10, 0, true);
    centralHeader.setUint16(12, dosTime, true);
    centralHeader.setUint16(14, dosDate, true);
    centralHeader.setUint32(16, crc, true);
    centralHeader.setUint32(20, data.byteLength, true);
    centralHeader.setUint32(24, data.byteLength, true);
    centralHeader.setUint16(28, nameBytes.byteLength, true);
    centralHeader.setUint16(30, 0, true); // extra field length
    centralHeader.setUint16(32, 0, true); // comment length
    centralHeader.setUint16(34, 0, true); // disk number start
    centralHeader.setUint16(36, 0, true); // internal attributes
    centralHeader.setUint32(38, 0, true); // external attributes
    centralHeader.setUint32(42, offset, true); // local header offset

    centralChunks.push(new Uint8Array(centralHeader.buffer), nameBytes);

    offset += localHeader.buffer.byteLength + nameBytes.byteLength + data.byteLength;
  }

  const centralDirectorySize = centralChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const centralDirectoryOffset = offset;

  const endRecord = new DataView(new ArrayBuffer(22));
  endRecord.setUint32(0, 0x06054b50, true);
  endRecord.setUint16(4, 0, true);
  endRecord.setUint16(6, 0, true);
  endRecord.setUint16(8, entries.length, true);
  endRecord.setUint16(10, entries.length, true);
  endRecord.setUint32(12, centralDirectorySize, true);
  endRecord.setUint32(16, centralDirectoryOffset, true);
  endRecord.setUint16(20, 0, true);

  return new Blob([...localChunks, ...centralChunks, new Uint8Array(endRecord.buffer)], {
    type: "application/zip",
  });
}

function dosDateTimeNow(): { dosTime: number; dosDate: number } {
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate =
    ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { dosTime, dosDate };
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.byteLength; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
