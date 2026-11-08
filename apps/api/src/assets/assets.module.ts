import { Global, Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

@Global()
@Module({ controllers: [AssetsController], providers: [AssetsService], exports: [AssetsService] })
export class AssetsModule {}
