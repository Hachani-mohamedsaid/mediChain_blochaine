import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserEntity } from '../../users/user.entity.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserEntity => {
    const request = ctx.switchToHttp().getRequest<{ user: UserEntity }>();
    return request.user;
  },
);
