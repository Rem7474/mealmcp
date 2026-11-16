import { describe, expect, it } from 'vitest';
import { pdfText, sniff } from './receipt.js';
import { makePdf } from './testPdf.js';

describe('receipt files', () => {
  it('knows a PDF and three picture formats by their bytes, and nothing else', () => {
    expect(sniff(makePdf('x'))).toBe('pdf');
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('jpeg');
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(sniff(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('webp');
    expect(sniff(Buffer.from('MZ\x90\0 an executable'))).toBeNull();
    expect(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniff(Buffer.alloc(0))).toBeNull();
  });

  it('reads the text layer of a digital PDF', async () => {
    const out = await pdfText(makePdf('2 kg rice 3.10 EUR and a long enough line'));
    expect(out).toMatchObject({ text: expect.stringContaining('2 kg rice 3.10 EUR') });
  });

  it('says a PDF without text is a scan, and refuses what is not a readable PDF', async () => {
    expect(await pdfText(makePdf(''))).toEqual({ scan: true });
    await expect(pdfText(Buffer.from('%PDF-1.4 garbage'))).rejects.toThrow(/could not be read/);
    await expect(pdfText(makePdf('some text on many pages', 11))).rejects.toThrow(/too many pages/);
  });
});
