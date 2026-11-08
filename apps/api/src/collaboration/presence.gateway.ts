import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { PresenceClientMessage, PresenceServerMessage, PresenceUser } from '@sigma/validation';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { AuthService } from '../auth/auth.service';
import type { AppConfig } from '../config/configuration';
import { SESSION_COOKIE } from '../config/configuration';
import { PermissionsService } from '../permissions/permissions.service';
import { roleHas } from '@sigma/validation';
import { CollabRoomsService } from './collab-rooms.service';

interface Client {
  socket: WebSocket;
  user: PresenceUser;
  documentId: string | null;
  canWrite: boolean;
  alive: boolean;
}

const COLORS = [
  '#f97316',
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#eab308',
  '#ef4444',
];
function colorFor(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length] as string;
}

/**
 * Live presence over WebSocket at /api/v1/presence: who is in a document, where their cursor is,
 * what they have selected, and "saved" notifications so stale editors can refresh before they
 * conflict. Document content itself still travels over HTTP with revisions (realtime co-editing
 * via CRDT is a later milestone).
 */
@Injectable()
export class PresenceGateway implements OnApplicationShutdown {
  private readonly logger = new Logger('Presence');
  private wss: WebSocketServer | null = null;
  private clients = new Set<Client>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly auth: AuthService,
    private readonly perms: PermissionsService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly rooms: CollabRoomsService,
  ) {
    this.rooms.onReplaced((documentId, state, revision) =>
      this.broadcast(documentId, { type: 'sync', state, revision }),
    );
  }

  /** Called from main.ts once the HTTP server exists. */
  attach(): void {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    this.wss = new WebSocketServer({ noServer: true });
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/api/v1/presence') return;
      void this.authenticate(req).then((user) => {
        if (!user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        this.wss?.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, user));
      });
    });
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) {
          c.socket.terminate();
          continue;
        }
        c.alive = false;
        c.socket.ping();
      }
    }, 30_000);
  }

  onApplicationShutdown(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.clients) c.socket.terminate();
    this.clients.clear();
    this.wss?.close();
  }

  private async authenticate(req: IncomingMessage): Promise<{ id: string; name: string } | null> {
    const origin = req.headers.origin;
    const allowed = new Set([
      this.config.get('corsOrigin', { infer: true }),
      `http://${req.headers.host}`,
      `https://${req.headers.host}`,
    ]);
    if (origin && !allowed.has(origin)) return null;
    const cookies = Object.fromEntries(
      (req.headers.cookie ?? '').split(';').map((c) => c.trim().split('=') as [string, string]),
    );
    const token = cookies[SESSION_COOKIE];
    if (token) {
      const resolved = await this.auth.resolve(decodeURIComponent(token));
      return resolved ? { id: resolved.user.id, name: resolved.user.name } : null;
    }
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (bearer) {
      const user = await this.auth.resolveBearer(bearer);
      return user ? { id: user.id, name: user.name } : null;
    }
    return null;
  }

  private onConnection(socket: WebSocket, user: { id: string; name: string }): void {
    const client: Client = {
      socket,
      user: {
        userId: user.id,
        name: user.name,
        color: colorFor(user.id),
        pageId: null,
        cursor: null,
        selection: [],
      },
      documentId: null,
      canWrite: false,
      alive: true,
    };
    this.clients.add(client);
    socket.on('pong', () => (client.alive = true));
    socket.on('message', (raw) => void this.onMessage(client, raw.toString()));
    socket.on('close', () => {
      this.clients.delete(client);
      if (client.documentId) {
        this.broadcast(client.documentId, { type: 'leave', userId: client.user.userId }, client);
        this.releaseIfEmpty(client.documentId);
      }
    });
  }

  private async onMessage(client: Client, raw: string): Promise<void> {
    let msg: PresenceClientMessage;
    try {
      msg = JSON.parse(raw) as PresenceClientMessage;
    } catch {
      return this.send(client, { type: 'error', message: 'Invalid message' });
    }
    if (msg.type === 'join') {
      let canWrite: boolean;
      try {
        const { workspaceId } = await this.perms.workspaceOfDocument(msg.documentId);
        const role = await this.perms.roleIn(client.user.userId, workspaceId);
        if (!role) throw new Error('forbidden');
        canWrite = roleHas(role, 'document.write');
      } catch {
        return this.send(client, { type: 'error', message: 'You cannot join this document' });
      }
      if (client.documentId) {
        this.broadcast(client.documentId, { type: 'leave', userId: client.user.userId }, client);
        this.releaseIfEmpty(client.documentId, client);
      }
      client.documentId = msg.documentId;
      client.canWrite = canWrite;
      const users = [...this.clients]
        .filter((c) => c.documentId === msg.documentId && c !== client)
        .map((c) => c.user);
      this.send(client, { type: 'presence', users });
      this.broadcast(msg.documentId, { type: 'awareness', user: client.user }, client);
      try {
        const { state, revision } = await this.rooms.join(msg.documentId);
        this.send(client, { type: 'sync', state, revision });
      } catch (e) {
        this.logger.warn(
          `Realtime sync unavailable for ${msg.documentId}: ${(e as Error).message}`,
        );
        this.send(client, { type: 'error', message: 'Realtime sync unavailable' });
      }
    } else if (msg.type === 'update' && client.documentId) {
      if (!client.canWrite)
        return this.send(client, { type: 'error', message: 'Your role cannot edit this document' });
      if (typeof msg.update !== 'string' || msg.update.length > 8_000_000)
        return this.send(client, { type: 'error', message: 'Invalid update' });
      try {
        await this.rooms.applyUpdate(client.documentId, msg.update, {
          id: client.user.userId,
          name: client.user.name,
        });
      } catch {
        return this.send(client, { type: 'error', message: 'Invalid update' });
      }
      this.broadcast(
        client.documentId,
        { type: 'update', update: msg.update, userId: client.user.userId },
        client,
      );
    } else if (msg.type === 'awareness' && client.documentId) {
      client.user = {
        ...client.user,
        pageId: msg.pageId,
        cursor: msg.cursor,
        selection: Array.isArray(msg.selection) ? msg.selection.slice(0, 200) : [],
      };
      this.broadcast(client.documentId, { type: 'awareness', user: client.user }, client);
    }
  }

  /** Notifies everyone else in the document that a new revision was saved. */
  notifySaved(documentId: string, revision: number, user: { id: string; name: string }): void {
    this.broadcast(documentId, { type: 'saved', revision, userId: user.id, userName: user.name });
  }

  private send(client: Client, msg: PresenceServerMessage): void {
    if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify(msg));
  }

  private broadcast(documentId: string, msg: PresenceServerMessage, except?: Client): void {
    for (const c of this.clients)
      if (c.documentId === documentId && c !== except) this.send(c, msg);
  }

  private releaseIfEmpty(documentId: string, leaving?: Client): void {
    const remaining = [...this.clients].some((c) => c.documentId === documentId && c !== leaving);
    if (!remaining)
      void this.rooms
        .release(documentId)
        .catch((e) => this.logger.warn(`Releasing ${documentId}: ${(e as Error).message}`));
  }

  /** Users currently in a document (for tests and the HTTP fallback). */
  usersIn(documentId: string): PresenceUser[] {
    return [...this.clients].filter((c) => c.documentId === documentId).map((c) => c.user);
  }
}
