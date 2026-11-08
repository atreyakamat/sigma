import type { DocumentJSON } from '@sigma/document';
import { parseDocumentJSON } from '@sigma/document';
import { migrateDocument } from '@sigma/document';

export const DOCUMENT_FILE_EXTENSION = '.sigma.json';
export const DOCUMENT_MIME = 'application/vnd.sigma.document+json';

/** Recursively sorts object keys so serialized files diff cleanly in version control. */
export function stableSort<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stableSort) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort())
      out[key] = stableSort((value as Record<string, unknown>)[key]);
    return out as T;
  }
  return value;
}

export function serializeDocument(
  doc: DocumentJSON,
  pretty = true,
  options: { stable?: boolean } = {},
): string {
  const data = options.stable === false ? doc : stableSort(doc);
  return JSON.stringify(data, null, pretty ? 2 : 0);
}

/** Parses, migrates and validates a document file's text. Throws on invalid input. */
export function parseDocumentFile(text: string): DocumentJSON {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON');
  }
  return parseDocumentJSON(migrateDocument(raw));
}
