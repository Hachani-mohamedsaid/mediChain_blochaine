import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { SuppliesController } from './supplies.controller.js';
import { SuppliesService } from './supplies.service.js';
import { SupplierProductsService } from './supplier-products.service.js';

@Module({
  imports: [UsersModule],
  controllers: [SuppliesController],
  providers: [SuppliesService, SupplierProductsService],
  exports: [SuppliesService, SupplierProductsService],
})
export class SuppliesModule {}
