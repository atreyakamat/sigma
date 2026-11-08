import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/auth.decorators';

export interface HealthResponse {
  status: 'ok';
  uptime: number;
}

@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', uptime: process.uptime() };
  }
}
