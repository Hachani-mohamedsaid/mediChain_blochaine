import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateSupplierProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  form?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? undefined : Number(value),
  )
  @IsNumber()
  @Min(0)
  priceMct?: number;

  /** Réutilise un id catalogue connu, sinon généré */
  @IsOptional()
  @IsString()
  medicineId?: string;
}
