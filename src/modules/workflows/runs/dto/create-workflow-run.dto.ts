import { IsOptional, IsObject, IsString, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TriggerVariablesDto {
  @ApiPropertyOptional({ example: { userId: 123 } })
  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;
}

export class CreateWorkflowRunDto {
  @ApiPropertyOptional({ description: 'Variables to pass to the workflow' })
  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Specific version to run (defaults to latest)',
    example: 1
  })
  @IsOptional()
  version?: number;

  @ApiPropertyOptional({ description: 'Webhook secret for authentication' })
  @IsOptional()
  @IsString()
  webhookSecret?: string;
}

export class QueryWorkflowRunDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional({ enum: ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'TIMED_OUT', 'CANCELLED'] })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 'desc' })
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
