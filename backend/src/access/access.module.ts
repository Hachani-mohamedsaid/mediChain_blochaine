import { Module } from '@nestjs/common';
import { AccessService } from './access.service.js';
import { AccessController } from './access.controller.js';
import { UsersModule } from '../users/users.module.js';
import { BlockchainModule } from '../blockchain/blockchain.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [UsersModule, BlockchainModule, AuditModule],
  providers: [AccessService],
  controllers: [AccessController],
  exports: [AccessService],
})
export class AccessModule {}
