import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(loginDto: LoginDto) {
    // TODO: Implement actual authentication with database
    // This is a placeholder that returns a mock response
    if (!loginDto.email || !loginDto.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      accessToken: this.jwtService.sign({ sub: 1, email: loginDto.email }),
      refreshToken: this.jwtService.sign({ sub: 1, type: 'refresh' }),
    };
  }
}
