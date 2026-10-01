import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from './authenticated-user.js';

/**
 * O userId vem SEMPRE do token validado, nunca de URL ou body (RN39, RS06).
 * Equivalente ao @AuthenticationPrincipal do Spring Security.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user as AuthenticatedUser;
});
