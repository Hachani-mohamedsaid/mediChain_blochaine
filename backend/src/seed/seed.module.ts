import { Module } from '@nestjs/common';
import { SeedService } from './seed.service.js';
import { UsersModule } from '../users/users.module.js';
import { BlockchainModule } from '../blockchain/blockchain.module.js';
import { RecordsModule } from '../records/records.module.js';

@Module({
  imports: [UsersModule, BlockchainModule, RecordsModule],
  providers: [SeedService],
})
export class SeedModule {}
