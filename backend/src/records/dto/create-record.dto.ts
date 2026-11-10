import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateRecordDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
