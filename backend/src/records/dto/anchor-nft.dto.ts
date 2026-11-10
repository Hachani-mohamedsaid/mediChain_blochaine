import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class AnchorNftDto {
  @IsInt()
  @Min(1)
  tokenId!: number;

  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/, {
    message: 'mintTxHash must be a tx hash',
  })
  mintTxHash!: string;

  @IsOptional()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/)
  nftContract?: string;
}
