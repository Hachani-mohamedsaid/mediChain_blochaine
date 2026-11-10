import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  doctorId!: string;

  @IsOptional()
  @IsString()
  memo?: string;

  /** Snapshot du tarif on-chain (ETH) au moment de la demande */
  @IsString()
  @Matches(/^\d+(\.\d+)?$/)
  feeEth!: string;
}
