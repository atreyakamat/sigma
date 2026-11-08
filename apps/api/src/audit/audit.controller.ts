import { Controller, Get, Query } from '@nestjs/common';
import { SystemAdmin } from '../common/auth.decorators';
import type { AuditEntryDto } from './audit.service';
import { AuditService } from './audit.service';

@SystemAdmin()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() list(
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<AuditEntryDto[]> {
    return this.audit.list(limit ? Number(limit) : 100, before);
  }
}
