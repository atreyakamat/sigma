import { describe, expect, it } from 'vitest';
import { pdfExportPath, shareLinkUrl } from '../export-urls';

describe('export urls', () => {
  it('builds PDF export paths for a page or a single frame', () => {
    expect(pdfExportPath('d1', 2)).toBe('/api/v1/documents/d1/export.pdf?scale=2');
    expect(pdfExportPath('d1', 1, 'f9', true)).toBe(
      '/api/v1/documents/d1/export.pdf?scale=1&frame=f9&approved=true',
    );
  });
  it('builds share URLs on the given origin', () => {
    expect(shareLinkUrl('abc', 'https://design.example.com')).toBe(
      'https://design.example.com/share/abc',
    );
  });
});
