import { describe, expect, it } from 'vitest';
import { buildPdf } from '../pdf';

const px = (w: number, h: number, rgb: [number, number, number]) => {
  const data = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) data.set(rgb, i * 3);
  return data;
};

describe('buildPdf', () => {
  it('writes a valid single-page PDF with an embedded RGB image sized in points', () => {
    const pdf = buildPdf([{ width: 2, height: 1, rgb: px(2, 1, [255, 0, 0]), title: 'Frame A' }]);
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Type /Catalog');
    expect(text).toContain('/Count 1');
    expect(text).toContain('/MediaBox [0 0 2 1]');
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('/ColorSpace /DeviceRGB');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // The xref table must point at the real byte offset of every object.
    const xrefAt = Number(/startxref\s+(\d+)/.exec(text)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const entries = text
      .slice(xrefAt)
      .split('\n')
      .slice(2)
      .filter((l) => /^\d{10} \d{5} n/.test(l));
    entries.forEach((line, i) => {
      const offset = Number(line.slice(0, 10));
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
  });

  it('makes one page per image, keeps the pixel data when no deflate is given, and compresses when it is', () => {
    const pages = [
      { width: 1, height: 1, rgb: px(1, 1, [1, 2, 3]) },
      { width: 3, height: 2, rgb: px(3, 2, [9, 9, 9]) },
    ];
    const raw = buildPdf(pages);
    const rawText = new TextDecoder('latin1').decode(raw);
    expect(rawText).toContain('/Count 2');
    expect(rawText).toContain('/MediaBox [0 0 3 2]');
    expect(rawText).not.toContain('/Filter /FlateDecode');
    expect(rawText).toContain('\u0001\u0002\u0003');

    const deflated = buildPdf(pages, { deflate: (d) => d.subarray(0, 1) });
    const defText = new TextDecoder('latin1').decode(deflated);
    expect(defText).toContain('/Filter /FlateDecode');
    expect(defText).toContain('/Length 1');
  });

  it('scales pages to points when a scale is given and sets document metadata', () => {
    const pdf = buildPdf([{ width: 200, height: 100, rgb: px(1, 1, [0, 0, 0]), title: 'Hero' }], {
      pointsPerPixel: 0.75,
      title: 'My file',
      producer: 'SIGMA',
    });
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text).toContain('/MediaBox [0 0 150 75]');
    expect(text).toContain('/Title (My file)');
    expect(text).toContain('/Producer (SIGMA)');
  });
});
