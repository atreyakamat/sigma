import type { DocumentJSON } from '@sigma/document';
import type {
  ConflictResponse,
  DocumentDto,
  DocumentSummaryDto,
  SaveContentResponse,
} from '@sigma/validation';
import { ApiRequestError, http } from './api';

export class ConflictError extends Error {
  constructor(public readonly serverRevision: number) {
    super('The document was modified elsewhere');
    this.name = 'ConflictError';
  }
}

/** Design-file persistence over the HTTP API with optimistic concurrency. */
export const documentRepository = {
  list(projectId: string): Promise<DocumentSummaryDto[]> {
    return http.get(`/projects/${projectId}/documents`);
  },
  get(id: string): Promise<DocumentDto> {
    return http.get(`/documents/${id}`);
  },
  create(projectId: string, name: string, content?: DocumentJSON): Promise<DocumentDto> {
    return http.post(`/projects/${projectId}/documents`, content ? { name, content } : { name });
  },
  async save(
    id: string,
    content: DocumentJSON,
    baseRevision: number,
    thumbnail?: string | null,
  ): Promise<SaveContentResponse> {
    try {
      return await http.put(`/documents/${id}/content`, { content, baseRevision, thumbnail });
    } catch (e) {
      if (e instanceof ApiRequestError && e.statusCode === 409)
        throw new ConflictError((e.body as ConflictResponse).revision);
      throw e;
    }
  },
  rename(id: string, name: string): Promise<DocumentSummaryDto> {
    return http.patch(`/documents/${id}`, { name });
  },
  remove(id: string): Promise<void> {
    return http.delete(`/documents/${id}`);
  },
  async duplicate(id: string): Promise<DocumentDto> {
    const doc = await this.get(id);
    return this.create(doc.projectId, `${doc.name} copy`, {
      ...doc.content,
      name: `${doc.name} copy`,
    });
  },
};
