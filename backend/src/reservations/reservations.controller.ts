import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsString, Min } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserEntity } from '../users/user.entity.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { ReservationsService } from './reservations.service.js';

class MarkPaidDto {
  @IsInt()
  @Min(1)
  paymentId!: number;

  @IsString()
  txHash!: string;
}

@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  create(@CurrentUser() user: UserEntity, @Body() dto: CreateReservationDto) {
    return this.reservations.create(user, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: UserEntity) {
    return this.reservations.listMine(user);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.reservations.accept(user, id);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.reservations.reject(user, id);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: UserEntity, @Param('id') id: string) {
    return this.reservations.cancel(user, id);
  }

  @Post(':id/mark-paid')
  markPaid(
    @CurrentUser() user: UserEntity,
    @Param('id') id: string,
    @Body() dto: MarkPaidDto,
  ) {
    return this.reservations.markPaid(user, id, dto);
  }
}
