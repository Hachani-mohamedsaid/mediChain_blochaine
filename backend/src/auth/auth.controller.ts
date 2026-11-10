import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { WalletAuthDto } from './dto/wallet-auth.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserEntity } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Get('nonce')
  nonce(@Query('address') address?: string) {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new BadRequestException('address query required (0x…)');
    }
    return this.authService.issueNonce(address);
  }

  @Post('wallet')
  wallet(@Body() dto: WalletAuthDto) {
    return this.authService.loginWithWallet(dto);
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: UserEntity) {
    return this.usersService.getPublic(user);
  }
}
