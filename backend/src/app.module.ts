import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PersistenceModule } from './common/persistence/persistence.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { RecordsModule } from './records/records.module.js';
import { AccessModule } from './access/access.module.js';
import { BlockchainModule } from './blockchain/blockchain.module.js';
import { AuditModule } from './audit/audit.module.js';
import { SeedModule } from './seed/seed.module.js';
import { ReservationsModule } from './reservations/reservations.module.js';
import { SuppliesModule } from './supplies/supplies.module.js';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PersistenceModule,
    AuthModule,
    UsersModule,
    RecordsModule,
    AccessModule,
    BlockchainModule,
    AuditModule,
    ReservationsModule,
    SuppliesModule,
    SeedModule,
  ],
})
export class AppModule {}

