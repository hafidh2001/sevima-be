import { IsString, IsNotEmpty, IsOptional, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkflowNodeDto {
  @ApiProperty({ example: 'step1' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: 'HTTP_CALL' })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty({ example: 'Fetch User Data' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: { url: 'https://api.example.com/users' } })
  @IsOptional()
  config?: Record<string, any>;
}

export class WorkflowEdgeDto {
  @ApiProperty({ example: 'start' })
  @IsString()
  @IsNotEmpty()
  from!: string;

  @ApiProperty({ example: 'step1' })
  @IsString()
  @IsNotEmpty()
  to!: string;
}

export class WorkflowDefinitionDto {
  @ApiProperty({ type: [WorkflowNodeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowNodeDto)
  nodes!: WorkflowNodeDto[];

  @ApiProperty({ type: [WorkflowEdgeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowEdgeDto)
  edges!: WorkflowEdgeDto[];
}

export class CreateWorkflowDto {
  @ApiProperty({ example: 'User Onboarding Workflow' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Automated workflow for new user onboarding process' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: WorkflowDefinitionDto })
  @ValidateNested()
  @Type(() => WorkflowDefinitionDto)
  definition!: WorkflowDefinitionDto;
}
