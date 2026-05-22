import { IsString, IsNotEmpty, IsOptional, ValidateNested, IsEnum, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateWorkflowDto } from './create-workflow.dto';
import { WorkflowStatus } from '@prisma/client';

const MAX_STRING_LENGTH = 500;

export class UpdateWorkflowDto {
  @ApiPropertyOptional({ example: 'Updated Workflow Name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, { message: 'Workflow name must be at most 200 characters' })
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_STRING_LENGTH, { message: `Description must be at most ${MAX_STRING_LENGTH} characters` })
  description?: string;

  @ApiPropertyOptional({ type: CreateWorkflowDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateWorkflowDto)
  definition?: CreateWorkflowDto['definition'];
}

export class UpdateWorkflowStatusDto {
  @ApiProperty({ enum: WorkflowStatus, example: WorkflowStatus.ACTIVE })
  @IsEnum(WorkflowStatus)
  status!: WorkflowStatus;
}
