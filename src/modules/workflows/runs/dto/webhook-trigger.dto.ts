import { IsString, IsNotEmpty, IsOptional, IsObject, ValidateNested, IsArray, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebhookTriggerDto {
  @ApiPropertyOptional({ description: 'Variables to pass to the workflow' })
  @IsOptional()
  @IsObject()
  @MaxLength(10000, { message: 'Variables object is too large (max 10000 characters)' })
  variables?: Record<string, any>;
}

export class WebhookQueryDto {
  @ApiProperty({ description: 'Webhook secret key' })
  @IsString()
  @IsNotEmpty()
  secret!: string;
}
