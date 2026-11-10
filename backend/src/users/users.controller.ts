import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { UserEntity } from './user.entity.js';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: UserEntity) {
    return this.usersService.getPublic(user);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: UserEntity, @Body() dto: UpdateUserDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Get('doctors')
  @Roles(Role.Patient, Role.Admin, Role.Doctor)
  listDoctors() {
    return this.usersService.listByRole(Role.Doctor);
  }

  @Get('patients')
  @Roles(Role.Doctor, Role.Admin, Role.Pharmacy)
  listPatients() {
    return this.usersService.listByRole(Role.Patient);
  }

  @Get('pharmacies')
  @Roles(Role.Patient, Role.Admin, Role.Pharmacy, Role.Supplier)
  listPharmacies() {
    return this.usersService.listByRole(Role.Pharmacy);
  }

  @Get('suppliers')
  @Roles(Role.Pharmacy, Role.Admin, Role.Supplier)
  listSuppliers() {
    return this.usersService.listByRole(Role.Supplier);
  }
}
