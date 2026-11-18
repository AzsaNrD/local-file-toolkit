import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFSignature,
  PDFString,
  type PDFDocument,
} from "pdf-lib";

export interface PdfSignatureInfo {
  fieldName: string;
  signed: boolean;
  /** The /Name the signing software wrote into the signature, if any. */
  signerName: string | null;
  /** Holder of the certificate that made the signature, read from the certificate itself. */
  certificateHolder: string | null;
  signedAt: Date | null;
  reason: string | null;
  location: string | null;
  /** True when bytes exist after the signed range, i.e. the file was saved again after signing. */
  changedAfterSigning: boolean | null;
}

// A signer or writer may leave a newline after the last signed byte.
const TRAILING_TOLERANCE_BYTES = 3;

interface Tlv {
  tag: number;
  start: number;
  end: number;
}

/** Reads one DER element; indefinite lengths (BER) return null, and the caller just skips the certificate. */
function readTlv(bytes: Uint8Array, offset: number): Tlv | null {
  if (offset + 2 > bytes.length) return null;
  const tag = bytes[offset];
  const first = bytes[offset + 1];
  let length: number;
  let headerLength: number;
  if (first < 0x80) {
    length = first;
    headerLength = 2;
  } else {
    const lengthBytes = first & 0x7f;
    if (lengthBytes === 0 || lengthBytes > 4) return null;
    length = 0;
    for (let i = 0; i < lengthBytes; i++) length = length * 256 + bytes[offset + 2 + i];
    headerLength = 2 + lengthBytes;
  }
  const start = offset + headerLength;
  const end = start + length;
  if (end > bytes.length) return null;
  return { tag, start, end };
}

function children(bytes: Uint8Array, parent: Tlv): Tlv[] {
  const result: Tlv[] = [];
  let offset = parent.start;
  while (offset < parent.end) {
    const tlv = readTlv(bytes, offset);
    if (!tlv) break;
    result.push(tlv);
    offset = tlv.end;
  }
  return result;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function decodeDerString(bytes: Uint8Array, tag: number): string {
  if (tag === 0x1e) {
    let text = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) text += String.fromCharCode(bytes[i] * 256 + bytes[i + 1]);
    return text;
  }
  return new TextDecoder(tag === 0x0c ? "utf-8" : "latin1").decode(bytes);
}

const OID_COMMON_NAME = [0x55, 0x04, 0x03];
const OID_ORGANIZATION = [0x55, 0x04, 0x0a];

function subjectName(bytes: Uint8Array, subject: Tlv): string | null {
  let commonName: string | null = null;
  let organization: string | null = null;
  for (const set of children(bytes, subject)) {
    for (const sequence of children(bytes, set)) {
      const [oid, value] = children(bytes, sequence);
      if (!oid || !value) continue;
      const oidBytes = bytes.subarray(oid.start, oid.end);
      const text = decodeDerString(bytes.subarray(value.start, value.end), value.tag);
      if (bytesEqual(oidBytes, Uint8Array.from(OID_COMMON_NAME))) commonName = text;
      else if (bytesEqual(oidBytes, Uint8Array.from(OID_ORGANIZATION))) organization = text;
    }
  }
  if (commonName && organization && commonName !== organization) return `${commonName} (${organization})`;
  return commonName ?? organization;
}

/**
 * Pulls the signing certificate's holder out of a PKCS#7 signature blob: the
 * certificate is matched to the signer by serial number, not just taken as
 * "the first one", because the list often also carries intermediate and root
 * certificates. Anything that does not parse as expected returns null
 * rather than a guess.
 */
function certificateHolder(blob: Uint8Array): string | null {
  try {
    const contentInfo = readTlv(blob, 0);
    if (!contentInfo || contentInfo.tag !== 0x30) return null;
    const [, explicitContent] = children(blob, contentInfo);
    if (!explicitContent) return null;
    const signedData = readTlv(blob, explicitContent.start);
    if (!signedData) return null;

    const parts = children(blob, signedData);
    const certificateSet = parts.find((part) => part.tag === 0xa0);
    const signerInfos = parts[parts.length - 1];
    if (!certificateSet || !signerInfos || signerInfos.tag !== 0x31) return null;

    const signerInfo = children(blob, signerInfos)[0];
    if (!signerInfo) return null;
    const [, signerId] = children(blob, signerInfo);
    if (!signerId || signerId.tag !== 0x30) return null;
    const serialElement = children(blob, signerId)[1];
    if (!serialElement) return null;
    const signerSerial = blob.subarray(serialElement.start, serialElement.end);

    for (const certificate of children(blob, certificateSet)) {
      const [tbs] = children(blob, certificate);
      if (!tbs) continue;
      const fields = children(blob, tbs);
      const offset = fields[0]?.tag === 0xa0 ? 1 : 0;
      const serial = fields[offset];
      const subject = fields[offset + 4];
      if (!serial || !subject) continue;
      if (bytesEqual(blob.subarray(serial.start, serial.end), signerSerial)) {
        return subjectName(blob, subject);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function textOf(dict: PDFDict, key: string): string | null {
  const value = dict.lookupMaybe(PDFName.of(key), PDFString, PDFHexString);
  return value ? value.decodeText() || null : null;
}

function dateOf(dict: PDFDict, key: string): Date | null {
  const value = dict.lookupMaybe(PDFName.of(key), PDFString, PDFHexString);
  if (!value) return null;
  try {
    return value.decodeDate();
  } catch {
    return null;
  }
}

function changedAfterSigning(dict: PDFDict, fileSize: number): boolean | null {
  const range = dict.lookupMaybe(PDFName.of("ByteRange"), PDFArray);
  if (!range || range.size() < 4) return null;
  const numbers = range.asArray().map((item) => (item instanceof PDFNumber ? item.asNumber() : NaN));
  const signedEnd = numbers[2] + numbers[3];
  if (Number.isNaN(signedEnd)) return null;
  return fileSize - signedEnd > TRAILING_TOLERANCE_BYTES;
}

/**
 * Reports what each signature field says about itself. It never verifies
 * anything: whether the signature is cryptographically valid, and whether
 * the certificate is trusted, are questions for a real PDF signature
 * validator, and this tool says so rather than implying a check happened.
 */
export function readSignatures(doc: PDFDocument, fileSize: number): PdfSignatureInfo[] {
  try {
    const signatures: PdfSignatureInfo[] = [];
    for (const field of doc.getForm().getFields()) {
      if (!(field instanceof PDFSignature)) continue;
      const fieldName = field.getName();
      const value = field.acroField.dict.lookupMaybe(PDFName.of("V"), PDFDict);
      if (!value) {
        signatures.push({
          fieldName,
          signed: false,
          signerName: null,
          certificateHolder: null,
          signedAt: null,
          reason: null,
          location: null,
          changedAfterSigning: null,
        });
        continue;
      }

      const contents = value.lookupMaybe(PDFName.of("Contents"), PDFString, PDFHexString);
      signatures.push({
        fieldName,
        signed: true,
        signerName: textOf(value, "Name"),
        certificateHolder: contents ? certificateHolder(contents.asBytes()) : null,
        signedAt: dateOf(value, "M"),
        reason: textOf(value, "Reason"),
        location: textOf(value, "Location"),
        changedAfterSigning: changedAfterSigning(value, fileSize),
      });
    }
    return signatures;
  } catch {
    return [];
  }
}
