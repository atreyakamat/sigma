import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { DocumentsModule } from '../documents/documents.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [DocumentsModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }])],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
