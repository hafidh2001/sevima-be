import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RoleIds } from '../../common/constants/roles';

export interface JwtPayload {
  sub: number;
  email: string;
  roleId: number;
  roleName: string;
  tenantId: number;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { tenant: true, role: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user.id, user.email, user.roleId, user.role.name, user.tenantId);
  }

  async register(dto: RegisterDto): Promise<{ userId: number }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });

    if (!tenant) {
      throw new BadRequestException('Tenant not found');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Default to VIEWER role if not specified
    const roleName = dto.role || 'VIEWER';
    const roleId = RoleIds[roleName as keyof typeof RoleIds];

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        roleId: roleId,
        tenantId: tenant.id,
      },
    });

    return { userId: user.id };
  }

  async refreshToken(dto: RefreshTokenDto): Promise<TokenPair> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(dto.refreshToken);

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { tenant: true, role: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      return this.generateTokens(user.id, user.email, user.roleId, user.role.name, user.tenantId);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async validateUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true, role: true },
    });

    if (!user || !user.isActive) {
      return null;
    }

    return user;
  }

  private generateTokens(
    userId: number,
    email: string,
    roleId: number,
    roleName: string,
    tenantId: number,
  ): TokenPair {
    const accessToken = this.jwtService.sign(
      {
        sub: userId,
        email,
        roleId,
        roleName,
        tenantId,
        type: 'access',
      } as any,
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRY') || '15m',
      } as any,
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: userId,
        type: 'refresh',
      } as any,
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRY') || '7d',
      } as any,
    );

    return { accessToken, refreshToken };
  }
}
