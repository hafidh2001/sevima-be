import { IsString, IsNotEmpty, IsOptional, ValidateNested, IsArray, MaxLength, ArrayMaxSize, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const NODE_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_STRING_LENGTH = 500;
const MAX_NODES = 100;
const MAX_EDGES = 200;

export class WorkflowNodeDto {
  @ApiProperty({ example: 'step1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Node ID must be at most 100 characters' })
  @Matches(NODE_ID_REGEX, { message: 'Node ID must contain only alphanumeric characters, underscores, and hyphens' })
  id!: string;

  @ApiProperty({ example: 'HTTP_CALL' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50, { message: 'Node type must be at most 50 characters' })
  type!: string;

  @ApiProperty({ example: 'Fetch User Data' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_STRING_LENGTH, { message: `Node name must be at most ${MAX_STRING_LENGTH} characters` })
  name!: string;

  @ApiPropertyOptional({ example: { url: 'https://api.example.com/users' } })
  @IsOptional()
  config?: Record<string, any>;
}

export class WorkflowEdgeDto {
  @ApiProperty({ example: 'start' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Edge source must be at most 100 characters' })
  from!: string;

  @ApiProperty({ example: 'step1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Edge target must be at most 100 characters' })
  to!: string;
}

export class WorkflowDefinitionDto {
  @ApiProperty({ type: [WorkflowNodeDto], description: `Maximum ${MAX_NODES} nodes allowed` })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowNodeDto)
  @ArrayMaxSize(MAX_NODES, { message: `Workflow cannot have more than ${MAX_NODES} nodes` })
  nodes!: WorkflowNodeDto[];

  @ApiProperty({ type: [WorkflowEdgeDto], description: `Maximum ${MAX_EDGES} edges allowed` })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowEdgeDto)
  @ArrayMaxSize(MAX_EDGES, { message: `Workflow cannot have more than ${MAX_EDGES} edges` })
  edges!: WorkflowEdgeDto[];
}

export class CreateWorkflowDto {
  @ApiProperty({ example: 'User Onboarding Workflow' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, { message: 'Workflow name must be at most 200 characters' })
  name!: string;

  @ApiPropertyOptional({ example: 'Automated workflow for new user onboarding process' })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_STRING_LENGTH, { message: `Description must be at most ${MAX_STRING_LENGTH} characters` })
  description?: string;

  @ApiProperty({ type: WorkflowDefinitionDto })
  @ValidateNested()
  @Type(() => WorkflowDefinitionDto)
  definition!: WorkflowDefinitionDto;
}
