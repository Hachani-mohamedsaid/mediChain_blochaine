import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserEntity } from '../users/user.entity.js';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('mine')
  mine(@CurrentUser() user: UserEntity) {
    return this.auditService.listMine(user);
  }

  @Get('patient/:patientId')
  patientHistory(
    @CurrentUser() user: UserEntity,
    @Param('patientId') patientId: string,
  ) {
    return this.auditService.listPatientHistory(user, patientId);
  }

  @Get('chain')
  chain(@CurrentUser() user: UserEntity) {
    return this.auditService.getChain(user);
  }
}
