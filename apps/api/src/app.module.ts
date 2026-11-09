import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AssetsModule } from './assets/assets.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { MetricsModule } from './metrics/metrics.module';
import { BootstrapService } from './bootstrap/bootstrap.service';
import { CollaborationModule } from './collaboration/collaboration.module';
import { CommentsModule } from './comments/comments.module';
import { configuration } from './config/configuration';
import { validateEnv } from './config/env.validation';
import { DocumentsModule } from './documents/documents.module';
import { ExportsModule } from './exports/exports.module';
import { FoldersModule } from './folders/folders.module';
import { HealthModule } from './health/health.module';
import { LibrariesModule } from './libraries/libraries.module';
import { MembershipsModule } from './memberships/memberships.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { UsersModule } from './users/users.module';
import { VersionsModule } from './versions/versions.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { SharingModule } from './sharing/sharing.module';
import { AiModule } from './ai/ai.module';
import { SetupModule } from './setup/setup.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // apps/api/.env first, then the repo root .env (paths are relative to the cwd).
      envFilePath: ['.env', '../../.env'],
      load: [configuration],
      validate: validateEnv,
    }),
    PrismaModule,
    AuditModule,
    MetricsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    SharingModule,
    AiModule,
    SetupModule,
    MembershipsModule,
    ProjectsModule,
    FoldersModule,
    DocumentsModule,
    ExportsModule,
    LibrariesModule,
    AssetsModule,
    CommentsModule,
    VersionsModule,
    CollaborationModule,
    PermissionsModule,
  ],
  providers: [BootstrapService],
})
export class AppModule {}
