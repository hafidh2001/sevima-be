import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@flowforge.dev' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: '12345' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  password!: string;
}
