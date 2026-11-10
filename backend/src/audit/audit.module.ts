import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditController } from './audit.controller.js';
import { BlockchainModule } from '../blockchain/blockchain.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [BlockchainModule, UsersModule],
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
