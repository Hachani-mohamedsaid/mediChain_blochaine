import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateSupplyDto {
  @IsString()
  @IsNotEmpty()
  pharmacyId!: string;

  @IsString()
  @IsNotEmpty()
  medicineId!: string;

  @IsString()
  @IsNotEmpty()
  medicineName!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  txHash?: string;

  /** Après fulfill MediChainSupply : stock déjà livré */
  @IsOptional()
  @IsBoolean()
  autoReceive?: boolean;
}
