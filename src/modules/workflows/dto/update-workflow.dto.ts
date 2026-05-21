import { IsString, IsNotEmpty, IsOptional, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateWorkflowDto } from './create-workflow.dto';

export class UpdateWorkflowDto {
  @ApiPropertyOptional({ example: 'Updated Workflow Name' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: CreateWorkflowDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateWorkflowDto)
  definition?: CreateWorkflowDto['definition'];
}

export class UpdateWorkflowStatusDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isActive!: boolean;
}
