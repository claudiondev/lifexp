import { createZodDto } from 'nestjs-zod';
import { userSchema } from '@lifexp/shared';

export class UserResponseDto extends createZodDto(userSchema) {}
