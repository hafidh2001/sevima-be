import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { WorkflowsService } from './workflows.service';
import { WorkflowRunsService } from './runs/workflow-runs.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { UpdateWorkflowStatusDto } from './dto/update-workflow.dto';
import { QueryWorkflowDto } from './dto/query-workflow.dto';
import { CreateWorkflowRunDto } from './runs/dto/create-workflow-run.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RoleName } from '../../common/constants/roles';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('workflows')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowRunsService: WorkflowRunsService,
  ) {}

  @Post()
  @Roles(RoleName.ADMIN, RoleName.EDITOR)
  @ApiOperation({ summary: 'Create a new workflow' })
  @ApiResponse({ status: 201, description: 'Workflow created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid workflow definition or validation error' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  create(
    @CurrentUser('userId') userId: number,
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflowsService.create(userId, tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all workflows for tenant' })
  @ApiResponse({ status: 200, description: 'List of workflows' })
  findAll(
    @CurrentUser('tenantId') tenantId: number,
    @Query() query: QueryWorkflowDto,
  ) {
    return this.workflowsService.findAll(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Workflow details' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  findOne(
    @CurrentUser('tenantId') tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.workflowsService.findOne(tenantId, id);
  }

  @Post(':id/trigger')
  @Roles(RoleName.ADMIN, RoleName.EDITOR)
  @ApiOperation({ summary: 'Manually trigger a workflow run' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 201, description: 'Workflow triggered successfully' })
  @ApiResponse({ status: 400, description: 'Invalid workflow or definition' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  trigger(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('userId') userId: number,
    @CurrentUser('tenantId') tenantId: number,
    @Body() dto: CreateWorkflowRunDto,
  ) {
    return this.workflowRunsService.trigger(id, userId, tenantId, dto);
  }

  @Get(':id/versions')
  @ApiOperation({ summary: 'Get all versions of a workflow' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'List of workflow versions' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  findVersions(
    @CurrentUser('tenantId') tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.workflowsService.findVersions(tenantId, id);
  }

  @Get(':id/versions/:version')
  @ApiOperation({ summary: 'Get specific version of a workflow' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiParam({ name: 'version', type: 'number' })
  @ApiResponse({ status: 200, description: 'Workflow version details' })
  @ApiResponse({ status: 404, description: 'Version or workflow not found' })
  getVersion(
    @CurrentUser('tenantId') tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.workflowsService.getVersion(tenantId, id, version);
  }

  @Put(':id')
  @Roles(RoleName.ADMIN, RoleName.EDITOR)
  @ApiOperation({ summary: 'Update workflow (creates new version)' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Workflow updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid workflow definition' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  update(
    @CurrentUser('userId') userId: number,
    @CurrentUser('tenantId') tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(userId, tenantId, id, dto);
  }

  @Post(':id/rollback/:targetVersion')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Rollback workflow to a previous version' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiParam({ name: 'targetVersion', type: 'number' })
  @ApiResponse({ status: 200, description: 'Workflow rolled back successfully' })
  @ApiResponse({ status: 404, description: 'Version or workflow not found' })
  @ApiResponse({ status: 403, description: 'Only admin can perform rollback' })
  rollback(
    @CurrentUser('tenantId') tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('targetVersion', ParseIntPipe) targetVersion: number,
  ) {
    return this.workflowsService.rollback(tenantId, id, targetVersion);
  }

  @Patch(':id/status')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Update workflow active status' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 403, description: 'Only admin can update status' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  updateStatus(
    @CurrentUser('tenantId') tenantId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkflowStatusDto,
  ) {
    return this.workflowsService.updateStatus(tenantId, id, dto.status);
  }

  @Delete(':id')
  @Roles(RoleName.ADMIN)
  @ApiOperation({ summary: 'Delete workflow' })
  @ApiParam({ name: 'id', type: 'number' })
  @ApiResponse({ status: 200, description: 'Workflow deleted successfully' })
  @ApiResponse({ status: 403, description: 'Only admin can delete workflow' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  delete(
    @CurrentUser('tenantId') tenantId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.workflowsService.delete(tenantId, id);
  }
}
