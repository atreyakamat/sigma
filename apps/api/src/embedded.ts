import 'reflect-metadata';
import type { AddressInfo } from 'node:net';

export { applyMigrations } from './common/migrate';

export interface StartSigmaOptions {
  databaseUrl: string;
  /** Folder for uploaded assets. */
  dataDir: string;
  sessionSecret: string;
  /** 0 picks a free port. */
  port: number;
  /** 127.0.0.1 for this computer only; 0.0.0.0 to let other devices on the network connect. */
  host: string;
  /** Built web client to serve (apps/web/dist). */
  webRoot: string;
  /** Address people use to reach the app; defaults to http://<host>:<port>. */
  publicUrl?: string;
  /** First-run setup screen instead of a bootstrap administrator. */
  desktop?: boolean;
  quiet?: boolean;
}

export interface RunningSigma {
  url: string;
  port: number;
  close(): Promise<void>;
}

/**
 * Starts the whole product (API, realtime socket and web client) in this process on one port.
 * The desktop app calls this after starting its bundled PostgreSQL and applying migrations.
 */
export async function startSigma(options: StartSigmaOptions): Promise<RunningSigma> {
  Object.assign(process.env, {
    DATABASE_URL: options.databaseUrl,
    DATA_DIR: options.dataDir,
    SESSION_SECRET: options.sessionSecret,
    NODE_ENV: process.env['NODE_ENV'] ?? 'production',
    SIGMA_DESKTOP: options.desktop ? '1' : '',
    COOKIE_SECURE: 'false',
    ...(options.publicUrl ? { CORS_ORIGIN: options.publicUrl } : {}),
  });
  // Loaded only now: the application module validates the environment as soon as it is imported.
  const { createSigmaApp } = await import('./app.factory');
  const { PresenceGateway } = await import('./collaboration/presence.gateway');
  const app = await createSigmaApp({
    webRoot: options.webRoot,
    ...(options.quiet ? { logger: false as const } : {}),
  });
  await app.listen(options.port, options.host);
  app.get(PresenceGateway).attach();
  const port = (app.getHttpServer().address() as AddressInfo).port;
  const url =
    options.publicUrl ??
    `http://${options.host === '0.0.0.0' ? '127.0.0.1' : options.host}:${port}`;
  return {
    url,
    port,
    close: async () => {
      // Open keep-alive and WebSocket connections would otherwise keep the server from closing.
      const server = app.getHttpServer() as { closeAllConnections?: () => void };
      const closing = app.close();
      server.closeAllConnections?.();
      await closing;
    },
  };
}
