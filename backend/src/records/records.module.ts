import { Module } from '@nestjs/common';
import { RecordsService } from './records.service.js';
import { RecordsController } from './records.controller.js';
import { AccessModule } from '../access/access.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { UsersModule } from '../users/users.module.js';
import { BlockchainModule } from '../blockchain/blockchain.module.js';

@Module({
  imports: [AccessModule, AuditModule, UsersModule, BlockchainModule],
  providers: [RecordsService],
  controllers: [RecordsController],
  exports: [RecordsService],
})
export class RecordsModule {}
