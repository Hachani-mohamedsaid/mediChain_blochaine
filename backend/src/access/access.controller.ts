import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessService } from './access.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserEntity } from '../users/user.entity.js';
import { GrantAccessDto } from './dto/grant-access.dto.js';

@Controller('access')
@UseGuards(JwtAuthGuard)
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Post('grant')
  grant(@CurrentUser() user: UserEntity, @Body() dto: GrantAccessDto) {
    return this.accessService.grantAccess(user, dto);
  }

  @Post(':id/revoke')
  revoke(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() body: { revokeTxHash?: string },
  ) {
    return this.accessService.revokeAccess(id, user, body?.revokeTxHash);
  }

  @Get('mine')
  mine(@CurrentUser() user: UserEntity) {
    return this.accessService.listMine(user);
  }

  @Get('incoming')
  incoming(@CurrentUser() user: UserEntity) {
    return this.accessService.listIncoming(user);
  }
}
