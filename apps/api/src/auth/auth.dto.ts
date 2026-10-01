import { createZodDto } from 'nestjs-zod';
import { authResponseSchema, loginSchema, registerSchema } from '@lifexp/shared';

export class RegisterDto extends createZodDto(registerSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
export class AuthResponseDto extends createZodDto(authResponseSchema) {}
