import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GLOBAL_PREFIX, createSigmaApp } from './app.factory';
import { PresenceGateway } from './collaboration/presence.gateway';
import type { AppConfig } from './config/configuration';

export { GLOBAL_PREFIX };

async function bootstrap(): Promise<void> {
  const app = await createSigmaApp({ webRoot: process.env['SIGMA_WEB_ROOT'] || undefined });
  const port = app.get(ConfigService<AppConfig, true>).get('port', { infer: true });
  await app.listen(port);
  app.get(PresenceGateway).attach();
  Logger.log(`Sigma API listening on http://localhost:${port}/${GLOBAL_PREFIX}`, 'Bootstrap');
}

void bootstrap();
