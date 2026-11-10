import { Role } from '../common/enums/role.enum.js';

export interface UserEntity {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  displayName: string;
  /** Spécialité médicale (médecins uniquement) */
  specialty?: string;
  walletAddress?: string;
  didHash?: string;
  registeredOnChain?: boolean;
  createdAt: string;
}

export type PublicUser = Omit<UserEntity, 'passwordHash'>;

export function toPublicUser(user: UserEntity): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}
