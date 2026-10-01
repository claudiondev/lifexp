import { createZodDto } from 'nestjs-zod';
import { updateProfileSchema, userSchema } from '@lifexp/shared';

export class UserResponseDto extends createZodDto(userSchema) {}
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
