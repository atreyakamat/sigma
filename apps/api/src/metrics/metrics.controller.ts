import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../common/auth.decorators';
import { renderMetrics } from './metrics';

@Public()
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(): string {
    return renderMetrics();
  }
}
