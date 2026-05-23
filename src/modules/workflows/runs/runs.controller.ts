import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RunsService } from './runs.service';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@ApiTags('runs')
@ApiBearerAuth('JWT-auth')
@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get global run statistics for all workflows' })
  @ApiResponse({ status: 200, description: 'Global run statistics' })
  getGlobalStats(@CurrentUser('tenantId') tenantId: number) {
    return this.runsService.getGlobalStats(tenantId);
  }
}
