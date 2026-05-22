import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, IsEnum, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsNotEmpty()
  tenantId!: number;

  @ApiProperty({ enum: ['ADMIN', 'EDITOR', 'VIEWER'], required: false })
  @IsOptional()
  @IsEnum(['ADMIN', 'EDITOR', 'VIEWER'])
  role?: 'ADMIN' | 'EDITOR' | 'VIEWER';
}
