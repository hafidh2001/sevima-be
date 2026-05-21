import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { WorkflowRunsService } from './workflow-runs.service';
import { CreateWorkflowRunDto, QueryWorkflowRunDto } from './dto/create-workflow-run.dto';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { Role } from '@prisma/client';

@ApiTags('workflows')
@ApiBearerAuth('JWT-auth')
@Controller('workflows/:workflowId/runs')
export class WorkflowRunsController {
  constructor(private readonly workflowRunsService: WorkflowRunsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.EDITOR)
  @ApiOperation({ summary: 'Trigger a workflow run' })
  @ApiParam({ name: 'workflowId', type: 'number' })
  @ApiResponse({ status: 201, description: 'Workflow triggered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid workflow or definition' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  trigger(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @CurrentUser('userId') userId: number,
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreateWorkflowRunDto,
  ) {
    return this.workflowRunsService.trigger(workflowId, userId, tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all runs for a workflow' })
  @ApiParam({ name: 'workflowId', type: 'number' })
  @ApiResponse({ status: 200, description: 'List of workflow runs' })
  findAll(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @CurrentUser('tenantId') tenantId: number,
    @Query() query: QueryWorkflowRunDto,
  ) {
    return this.workflowRunsService.findAll(tenantId, workflowId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get run statistics for a workflow' })
  @ApiParam({ name: 'workflowId', type: 'number' })
  @ApiResponse({ status: 200, description: 'Workflow run statistics' })
  getStats(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.workflowRunsService.getStats(tenantId, workflowId);
  }

  @Get(':runId')
  @ApiOperation({ summary: 'Get workflow run details' })
  @ApiParam({ name: 'workflowId', type: 'number' })
  @ApiParam({ name: 'runId', type: 'number' })
  @ApiResponse({ status: 200, description: 'Workflow run details' })
  @ApiResponse({ status: 404, description: 'Run not found' })
  findOne(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('runId', ParseIntPipe) runId: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.workflowRunsService.findOne(tenantId, runId);
  }

  @Post(':runId/cancel')
  @Roles(Role.ADMIN, Role.EDITOR)
  @ApiOperation({ summary: 'Cancel a running workflow' })
  @ApiParam({ name: 'workflowId', type: 'number' })
  @ApiParam({ name: 'runId', type: 'number' })
  @ApiResponse({ status: 200, description: 'Workflow cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel workflow' })
  cancel(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('runId', ParseIntPipe) runId: number,
    @CurrentUser('userId') userId: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.workflowRunsService.cancel(tenantId, runId, userId);
  }

  @Post(':runId/retry')
  @Roles(Role.ADMIN, Role.EDITOR)
  @ApiOperation({ summary: 'Retry a failed workflow' })
  @ApiParam({ name: 'workflowId', type: 'number' })
  @ApiParam({ name: 'runId', type: 'number' })
  @ApiResponse({ status: 200, description: 'Workflow retry triggered' })
  @ApiResponse({ status: 400, description: 'Cannot retry workflow' })
  retry(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('runId', ParseIntPipe) runId: number,
    @CurrentUser('userId') userId: number,
    @CurrentUser('tenantId') tenantId: number,
  ) {
    return this.workflowRunsService.retry(tenantId, runId, userId);
  }
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly workflowRunsService: WorkflowRunsService) {}

  @Post('workflows/:workflowId')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger workflow via webhook' })
  @ApiParam({ name: 'workflowId', type: 'number' })
  @ApiResponse({ status: 200, description: 'Webhook triggered successfully' })
  @ApiResponse({ status: 401, description: 'Invalid webhook secret' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  triggerWebhook(
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Query('secret') secret: string,
    @Body() body: { variables?: Record<string, any> },
  ) {
    // In production, verify the webhook secret properly
    return this.workflowRunsService.triggerWebhook(workflowId, body, secret, 1);
  }
}
