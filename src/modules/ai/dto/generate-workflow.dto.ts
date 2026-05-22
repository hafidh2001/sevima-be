import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkflowNodeDto {
  @ApiProperty({ example: 'fetch_user_data' })
  id!: string;

  @ApiProperty({ example: 'HTTP_CALL', enum: ['HTTP_CALL', 'SCRIPT', 'DELAY', 'CONDITIONAL'] })
  type!: string;

  @ApiProperty({ example: 'Fetch User Data' })
  name!: string;

  @ApiProperty({ example: { url: 'https://api.example.com/users', method: 'GET' } })
  config!: Record<string, any>;

  @ApiPropertyOptional({ example: { maxRetries: 3, initialDelay: 1000, backoffMultiplier: 2 } })
  retryConfig?: { maxRetries: number; initialDelay: number; backoffMultiplier: number };
}

export class WorkflowEdgeDto {
  @ApiProperty({ example: 'fetch_user_data' })
  from!: string;

  @ApiProperty({ example: 'validate_email' })
  to!: string;

  @ApiPropertyOptional({ example: 'status === 200' })
  condition?: string;
}

export class WorkflowDefinitionDto {
  @ApiProperty({ type: [WorkflowNodeDto] })
  nodes!: WorkflowNodeDto[];

  @ApiProperty({ type: [WorkflowEdgeDto] })
  edges!: WorkflowEdgeDto[];
}

export class GeneratedWorkflowDto {
  @ApiProperty({ example: 'User Onboarding Workflow' })
  name!: string;

  @ApiProperty({ example: 'Fetches user data, validates email, and sends welcome email' })
  description!: string;

  @ApiProperty({ type: WorkflowDefinitionDto })
  definition!: WorkflowDefinitionDto;
}

export class GenerateWorkflowDto {
  @ApiProperty({
    description: 'Natural language description of the workflow to generate',
    example: 'First fetch user data from an API, then validate the email, if valid send a welcome email and log the action. If invalid, send an error notification.',
    minLength: 10,
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Description must be at least 10 characters' })
  @MaxLength(2000, { message: 'Description must not exceed 2000 characters' })
  description!: string;
}

export class GenerateWorkflowResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: GeneratedWorkflowDto })
  data!: GeneratedWorkflowDto;
}
