import { IsUUID } from 'class-validator';

export class RegisterPatientDto {
  @IsUUID()
  userId!: string;
}
