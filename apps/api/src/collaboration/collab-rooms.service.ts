import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { SceneGraph, parseDocumentJSON } from '@sigma/document';
import type { DocumentJSON } from '@sigma/document';
import { Y, decodeUpdate, documentFromYDoc, encodeUpdate, populateYDoc } from '@sigma/collab';
import { PrismaService } from '../prisma/prisma.service';

export interface RoomUser {
  id: string;
  name: string;
}

interface Room {
  doc: Y.Doc;
  revision: number;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  firstDirtyAt: number;
  lastUser: RoomUser | null;
  persisting: Promise<void> | null;
}

/** Saves the realtime state to the database; returns the new revision. */
export type Persister = (
  documentId: string,
  content: DocumentJSON,
  user: RoomUser,
) => Promise<number>;

export const PERSIST_DEBOUNCE_MS = Number(process.env['COLLAB_PERSIST_DEBOUNCE_MS'] ?? 1000);
const PERSIST_MAX_WAIT_MS = PERSIST_DEBOUNCE_MS * 5;

/**
 * Server-side CRDT rooms: one Y.Doc per open document. Participants' updates are applied here,
 * fanned out by the presence gateway, and folded into the `documents` row after a short debounce,
 * so HTTP readers (exports, CLI, version snapshots) always see a recent revision. When a document
 * is replaced over HTTP (version restore, CLI checkpoint, offline flush) the room is rebuilt and
 * every participant receives a full `sync`.
 */
@Injectable()
export class CollabRoomsService implements OnApplicationShutdown {
  private readonly logger = new Logger('Collab');
  private rooms = new Map<string, Room>();
  private loading = new Map<string, Promise<Room>>();
  private persister: Persister | null = null;
  private replacedListeners = new Set<
    (documentId: string, state: string, revision: number) => void
  >();

  constructor(private readonly prisma: PrismaService) {}

  setPersister(p: Persister): void {
    this.persister = p;
  }

  /** Fired after `replace` so the gateway can push the new state to participants. */
  onReplaced(listener: (documentId: string, state: string, revision: number) => void): () => void {
    this.replacedListeners.add(listener);
    return () => this.replacedListeners.delete(listener);
  }

  /** Loads (or returns) the room and its full state as a base64 update. */
  async join(documentId: string): Promise<{ state: string; revision: number }> {
    const room = await this.ensure(documentId);
    return { state: encodeUpdate(Y.encodeStateAsUpdate(room.doc)), revision: room.revision };
  }

  /** Applies a participant's update. Throws when the update is not a valid Yjs update. */
  async applyUpdate(documentId: string, update: string, user: RoomUser): Promise<void> {
    const room = await this.ensure(documentId);
    Y.applyUpdate(room.doc, decodeUpdate(update), user.id);
    room.lastUser = user;
    if (!room.dirty) room.firstDirtyAt = Date.now();
    room.dirty = true;
    this.schedule(documentId, room);
  }

  /** Rebuilds the room from content saved over HTTP (no-op when nobody has the document open). */
  replace(documentId: string, content: DocumentJSON, revision: number): void {
    const room = this.rooms.get(documentId);
    if (!room) return;
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.dirty = false;
    room.doc = this.build(content);
    room.revision = revision;
    const state = encodeUpdate(Y.encodeStateAsUpdate(room.doc));
    for (const l of this.replacedListeners) l(documentId, state, revision);
  }

  /** Persists pending changes now (tests, shutdown, last participant leaving). */
  async flush(documentId: string): Promise<void> {
    const room = this.rooms.get(documentId);
    if (!room) return;
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    await this.persist(documentId, room);
  }

  /** Called when the last participant leaves: persist and drop the in-memory copy. */
  async release(documentId: string): Promise<void> {
    await this.flush(documentId);
    this.rooms.delete(documentId);
  }

  /** Current revision known to the room (for tests). */
  revisionOf(documentId: string): number | null {
    return this.rooms.get(documentId)?.revision ?? null;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.rooms.keys()].map((id) => this.flush(id).catch(() => undefined)));
  }

  private ensure(documentId: string): Promise<Room> {
    const existing = this.rooms.get(documentId);
    if (existing) return Promise.resolve(existing);
    const pending = this.loading.get(documentId);
    if (pending) return pending;
    const load = (async () => {
      const d = await this.prisma.document.findFirst({
        where: { id: documentId, deletedAt: null },
        select: { content: true, revision: true },
      });
      if (!d) throw new NotFoundException('Document not found');
      const room: Room = {
        doc: this.build(d.content as DocumentJSON),
        revision: d.revision,
        dirty: false,
        timer: null,
        firstDirtyAt: 0,
        lastUser: null,
        persisting: null,
      };
      this.rooms.set(documentId, room);
      return room;
    })().finally(() => this.loading.delete(documentId));
    this.loading.set(documentId, load);
    return load;
  }

  private build(content: DocumentJSON): Y.Doc {
    const doc = new Y.Doc();
    populateYDoc(SceneGraph.fromJSON(content), doc, 'server');
    return doc;
  }

  private schedule(documentId: string, room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    const waited = Date.now() - room.firstDirtyAt;
    const delay = Math.max(0, Math.min(PERSIST_DEBOUNCE_MS, PERSIST_MAX_WAIT_MS - waited));
    room.timer = setTimeout(() => {
      room.timer = null;
      void this.persist(documentId, room);
    }, delay);
  }

  private async persist(documentId: string, room: Room): Promise<void> {
    if (room.persisting) await room.persisting;
    if (!room.dirty || !this.persister || !room.lastUser) return;
    room.dirty = false;
    const user = room.lastUser;
    room.persisting = (async () => {
      try {
        const content = parseDocumentJSON({ ...documentFromYDoc(room.doc), id: documentId });
        room.revision = await this.persister!(documentId, content, user);
      } catch (e) {
        room.dirty = true;
        this.logger.error(`Persisting ${documentId} failed: ${(e as Error).message}`);
      }
    })();
    await room.persisting;
    room.persisting = null;
    if (room.dirty && !room.timer) this.schedule(documentId, room);
  }
}
