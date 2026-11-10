import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { UserEntity } from '../users/user.entity.js';
import { CreateSupplyDto } from './dto/create-supply.dto.js';
import { CreateSupplierProductDto } from './dto/create-supplier-product.dto.js';
import { UpdateSupplierProductDto } from './dto/update-supplier-product.dto.js';
import { SuppliesService } from './supplies.service.js';
import { SupplierProductsService } from './supplier-products.service.js';

@Controller('supplies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SuppliesController {
  constructor(
    private readonly supplies: SuppliesService,
    private readonly products: SupplierProductsService,
  ) {}

  @Post()
  @Roles(Role.Supplier)
  create(@CurrentUser() user: UserEntity, @Body() dto: CreateSupplyDto) {
    return this.supplies.create(user, dto);
  }

  @Get('mine')
  @Roles(Role.Supplier, Role.Pharmacy)
  mine(@CurrentUser() user: UserEntity) {
    return this.supplies.listMine(user);
  }

  @Get('products/mine')
  @Roles(Role.Supplier)
  myProducts(@CurrentUser() user: UserEntity) {
    return this.products.listMine(user);
  }

  @Get('products/by-supplier/:supplierId')
  @Roles(Role.Pharmacy, Role.Supplier)
  productsBySupplier(
    @CurrentUser() user: UserEntity,
    @Param('supplierId') supplierId: string,
  ) {
    return this.products.listBySupplier(user, supplierId);
  }

  @Post('products')
  @Roles(Role.Supplier)
  addProduct(
    @CurrentUser() user: UserEntity,
    @Body() dto: CreateSupplierProductDto,
  ) {
    return this.products.create(user, dto);
  }

  @Patch('products/:id')
  @Roles(Role.Supplier)
  updateProduct(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierProductDto,
  ) {
    return this.products.update(user, id, dto);
  }

  @Delete('products/:id')
  @Roles(Role.Supplier)
  removeProduct(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.products.remove(user, id);
  }

  @Post(':id/receive')
  @Roles(Role.Pharmacy)
  receive(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.supplies.receive(user, id);
  }
}
