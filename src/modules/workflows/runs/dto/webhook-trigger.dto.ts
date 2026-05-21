import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebhookTriggerDto {
  @ApiPropertyOptional({ description: 'Variables to pass to the workflow' })
  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;
}

export class WebhookQueryDto {
  @ApiProperty({ description: 'Webhook secret key' })
  @IsString()
  @IsNotEmpty()
  secret!: string;
}
