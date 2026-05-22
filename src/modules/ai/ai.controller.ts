import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WorkflowGeneratorService, GeneratedWorkflow } from './workflow-generator.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { GenerateWorkflowDto, GenerateWorkflowResponseDto } from './dto/generate-workflow.dto';

@ApiTags('ai')
@ApiBearerAuth('JWT-auth')
@Controller('ai')
export class AiController {
  constructor(private readonly workflowGenerator: WorkflowGeneratorService) {}

  @Post('generate-workflow')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN, Role.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a workflow from natural language description' })
  @ApiResponse({ status: 200, description: 'Generated workflow definition', type: GenerateWorkflowResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid description or AI returned malformed output' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'AI service error' })
  async generateWorkflow(@Body() dto: GenerateWorkflowDto): Promise<GenerateWorkflowResponseDto> {
    const workflow = await this.workflowGenerator.generateFromDescription(dto.description);
    return {
      success: true,
      data: workflow,
    };
  }

  @Post('generate-workflow/stream')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.ADMIN, Role.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a workflow from natural language (streaming)' })
  @ApiResponse({ status: 200, description: 'Generated workflow definition' })
  @ApiResponse({ status: 400, description: 'Invalid description' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 500, description: 'AI service error' })
  async generateWorkflowStream(@Body() dto: GenerateWorkflowDto) {
    const chunks: string[] = [];

    const workflow = await this.workflowGenerator.generateStream(
      dto.description,
      (chunk) => chunks.push(chunk),
    );

    return {
      success: true,
      data: workflow,
      streamedContent: chunks.join(''),
    };
  }
}
