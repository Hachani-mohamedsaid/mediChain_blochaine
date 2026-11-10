import { IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class WalletAuthDto {
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'address must be a valid Ethereum address',
  })
  address!: string;

  @IsString()
  @MinLength(10)
  signature!: string;

  /** Obligatoire à la 1ʳᵉ connexion d’un wallet inconnu */
  @IsOptional()
  @IsIn(['patient', 'doctor', 'pharmacy', 'supplier'])
  role?: 'patient' | 'doctor' | 'pharmacy' | 'supplier';

  @IsOptional()
  @IsString()
  @MinLength(2)
  displayName?: string;
}
