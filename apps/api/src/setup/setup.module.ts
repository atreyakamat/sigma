import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsModule } from '../documents/documents.module';
import { SetupController } from './setup.controller';

@Module({ imports: [AuthModule, DocumentsModule], controllers: [SetupController] })
export class SetupModule {}
