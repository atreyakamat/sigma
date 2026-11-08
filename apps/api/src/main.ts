import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PresenceGateway } from './collaboration/presence.gateway';
import type { AppConfig } from './config/configuration';

export const GLOBAL_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService<AppConfig, true>);

  app.setGlobalPrefix(GLOBAL_PREFIX);
  if (config.get('trustProxy', { infer: true }))
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('corsOrigin', { infer: true }),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableShutdownHooks();

  const port = config.get('port', { infer: true });
  await app.listen(port);
  app.get(PresenceGateway).attach();
  Logger.log(`Sigma API listening on http://localhost:${port}/${GLOBAL_PREFIX}`, 'Bootstrap');
}

void bootstrap();
