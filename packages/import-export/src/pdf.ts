/**
 * Minimal PDF 1.4 writer: one page per raster image (RGB, 8 bits per channel), optionally
 * Flate-compressed through an injected `deflate` so the package stays runtime-agnostic. Enough for
 * "export frames as PDF"; vector PDF output is a later milestone.
 */
export interface PdfImagePage {
  width: number;
  height: number;
  /** Tightly packed RGB bytes, `width * height * 3`. */
  rgb: Uint8Array;
  title?: string;
}

export interface PdfOptions {
  /** Compresses image streams (e.g. `zlib.deflateSync`). Without it pixels are stored raw. */
  deflate?: (data: Uint8Array) => Uint8Array;
  /** Page size = pixels × pointsPerPixel (default 1: one CSS pixel per point). */
  pointsPerPixel?: number;
  title?: string;
  producer?: string;
}

const latin1 = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
};

const escapePdfString = (s: string): string =>
  s
    .replace(/[\\()]/g, (c) => `\\${c}`)
    .replace(/[^\x20-\x7e]/g, (c) => `\\${c.charCodeAt(0).toString(8).padStart(3, '0')}`);

const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');

export function buildPdf(pages: PdfImagePage[], options: PdfOptions = {}): Uint8Array {
  if (pages.length === 0) throw new Error('A PDF needs at least one page');
  const ppp = options.pointsPerPixel ?? 1;
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    length += bytes.length;
  };
  const text = (s: string) => push(latin1(s));
  const object = (num: number, body: string, stream?: Uint8Array) => {
    offsets[num] = length;
    text(`${num} 0 obj\n${body}\n`);
    if (stream) {
      text('stream\n');
      push(stream);
      text('\nendstream\n');
    }
    text('endobj\n');
  };

  text('%PDF-1.4\n%âãÏÓ\n');
  // Object numbering: 1 catalog, 2 pages, 3 info, then per page: page, content, image.
  const firstPageObj = 4;
  const pageObj = (i: number) => firstPageObj + i * 3;
  const kids = pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  const info = [
    options.title ? `/Title (${escapePdfString(options.title)})` : '',
    `/Producer (${escapePdfString(options.producer ?? 'SIGMA')})`,
    `/CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z)`,
  ]
    .filter(Boolean)
    .join(' ');
  object(3, `<< ${info} >>`);

  pages.forEach((page, i) => {
    const w = page.width * ppp;
    const h = page.height * ppp;
    const p = pageObj(i);
    const content = latin1(`q ${fmt(w)} 0 0 ${fmt(h)} 0 0 cm /Im0 Do Q`);
    object(
      p,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(w)} ${fmt(h)}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R${page.title ? ` /SIGMATitle (${escapePdfString(page.title)})` : ''} >>`,
    );
    object(p + 1, `<< /Length ${content.length} >>`, content);
    const data = options.deflate ? options.deflate(page.rgb) : page.rgb;
    object(
      p + 2,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8${options.deflate ? ' /Filter /FlateDecode' : ''} /Length ${data.length} >>`,
      data,
    );
  });

  const count = offsets.length;
  const xref = length;
  text(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) text(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  text(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Drops the alpha channel of RGBA pixels (assumes the image was composited on a background). */
export function rgbaToRgb(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const n = rgba.length / 4;
  const out = new Uint8Array(n * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    out[j] = rgba[i]!;
    out[j + 1] = rgba[i + 1]!;
    out[j + 2] = rgba[i + 2]!;
  }
  return out;
}
