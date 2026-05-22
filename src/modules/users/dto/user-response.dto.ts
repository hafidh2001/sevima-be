import { ApiProperty } from '@nestjs/swagger';
import { RoleName } from '../../../common/constants/roles';

export class UserResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'John Doe' })
  name!: string;

  @ApiProperty({ enum: RoleName, example: RoleName.ADMIN })
  roleId!: number;

  @ApiProperty({ example: 'ADMIN' })
  roleName!: string;

  @ApiProperty({ example: 1 })
  tenantId!: number;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updatedAt!: Date;
}

export class TenantInfoDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'acme-corp' })
  slug!: string;

  @ApiProperty({ example: 'Acme Corporation' })
  name!: string;
}

export class UserWithTenantResponseDto extends UserResponseDto {
  @ApiProperty({ type: TenantInfoDto })
  tenant!: TenantInfoDto;
}