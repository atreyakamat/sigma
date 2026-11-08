import { Global, Module } from '@nestjs/common';
import { PresenceGateway } from './presence.gateway';

@Global()
@Module({ providers: [PresenceGateway], exports: [PresenceGateway] })
export class CollaborationModule {}
