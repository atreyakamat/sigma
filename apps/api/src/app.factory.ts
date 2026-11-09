import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { metricsMiddleware } from './metrics/metrics';

export const GLOBAL_PREFIX = 'api/v1';

/** Same policy nginx applies in the Docker stack (infrastructure/deployment/security-headers.conf). */
const SPA_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";

export interface CreateAppOptions {
  /** Folder with the built web client; when set, this process serves the UI as well as the API. */
  webRoot?: string;
  logger?: false;
}

/** Builds the fully configured Nest application without listening. */
export async function createSigmaApp(options: CreateAppOptions = {}): Promise<INestApplication> {
  const app = await NestFactory.create(
    AppModule,
    options.logger === false ? { logger: false } : {},
  );
  const config = app.get(ConfigService<AppConfig, true>);

  app.setGlobalPrefix(GLOBAL_PREFIX);
  if (config.get('trustProxy', { infer: true }))
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(metricsMiddleware);
  // When this process also serves the client, the page needs the SPA policy instead of helmet's default.
  app.use(helmet(options.webRoot ? { contentSecurityPolicy: false } : {}));
  app.use(cookieParser());
  app.enableCors({ origin: config.get('corsOrigin', { infer: true }), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableShutdownHooks();

  if (options.webRoot) {
    const root = options.webRoot;
    if (!existsSync(join(root, 'index.html'))) throw new Error(`No index.html in web root ${root}`);
    const headers = (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader('Content-Security-Policy', SPA_CSP);
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      next();
    };
    const isApi = (req: Request) =>
      req.path === `/${GLOBAL_PREFIX}` || req.path.startsWith(`/${GLOBAL_PREFIX}/`);
    const assets = express.static(root, { index: false, maxAge: '1h' });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (isApi(req) || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
      headers(req, res, () =>
        assets(req, res, () => {
          // Client-side routes (/file/…, /share/…) all resolve to the single page.
          res.setHeader('Cache-Control', 'no-cache');
          res.sendFile(join(root, 'index.html'));
        }),
      );
    });
  }
  return app;
}
