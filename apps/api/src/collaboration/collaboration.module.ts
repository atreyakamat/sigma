import { Global, Module } from '@nestjs/common';
import { CollabRoomsService } from './collab-rooms.service';
import { PresenceGateway } from './presence.gateway';

@Global()
@Module({
  providers: [PresenceGateway, CollabRoomsService],
  exports: [PresenceGateway, CollabRoomsService],
})
export class CollaborationModule {}
