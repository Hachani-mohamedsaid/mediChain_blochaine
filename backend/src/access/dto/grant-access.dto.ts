import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

export class GrantAccessDto {
  @IsUUID()
  doctorId!: string;

  @IsUUID()
  recordId!: string;

  @IsString()
  @MinLength(3)
  purpose!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  /** Si fourni : tx déjà signée via MetaMask */
  @IsOptional()
  @IsInt()
  @Min(1)
  chainGrantId?: number;

  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/)
  grantTxHash?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(['read', 'download', 'annotate'], { each: true })
  permissions?: Array<'read' | 'download' | 'annotate'>;

  @IsOptional()
  @IsBoolean()
  emergency?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(5)
  emergencyReason?: string;
}
