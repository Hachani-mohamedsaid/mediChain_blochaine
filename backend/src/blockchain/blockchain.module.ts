import { Module } from '@nestjs/common';
import { BlockchainService } from './blockchain.service.js';
import { BlockchainController } from './blockchain.controller.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [UsersModule],
  providers: [BlockchainService],
  controllers: [BlockchainController],
  exports: [BlockchainService],
})
export class BlockchainModule {}
