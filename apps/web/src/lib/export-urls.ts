/** API path for a server-rendered PDF of a document (all frames of the first page, or one frame). */
export function pdfExportPath(
  documentId: string,
  scale: number,
  frameId: string | null = null,
  approvedOnly = false,
): string {
  const params = new URLSearchParams({ scale: String(scale) });
  if (frameId) params.set('frame', frameId);
  if (approvedOnly) params.set('approved', 'true');
  return `/api/v1/documents/${documentId}/export.pdf?${params.toString()}`;
}

/** Public URL of a share link for the current origin. */
export function shareLinkUrl(token: string, origin = window.location.origin): string {
  return `${origin}/share/${token}`;
}
