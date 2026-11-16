import { extractText, getDocumentProxy } from 'unpdf';
import { ValidationError } from '../domain/errors.js';

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 10;
const MAX_CHARS = 20_000;
const MIN_CHARS = 20;

export type ReceiptKind = 'pdf' | 'jpeg' | 'png' | 'webp';
export const RECEIPT_MIME: Record<ReceiptKind, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** What the bytes really are, whatever the client claimed: only a PDF and three picture formats are accepted. */
export function sniff(buf: Buffer): ReceiptKind | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

/**
 * The text layer of a digital PDF receipt, no OCR. An empty result means the PDF is a scan (a picture): the caller
 * says so and falls back to the photo path. Pages and characters are capped; nothing is stored.
 */
export async function pdfText(buf: Buffer): Promise<{ text: string } | { scan: true }> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    if (pdf.numPages > MAX_PAGES) throw new ValidationError(`That PDF has too many pages (at most ${MAX_PAGES})`);
    const { text } = await extractText(pdf, { mergePages: true });
    const clean = text.replace(/[ \t]+/g, ' ').trim();
    if (clean.length < MIN_CHARS) return { scan: true };
    return { text: clean.slice(0, MAX_CHARS) };
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError('That PDF could not be read');
  }
}
