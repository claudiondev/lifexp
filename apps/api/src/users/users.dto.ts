import { createZodDto } from 'nestjs-zod';
import {
  accountExportSchema,
  deleteAccountSchema,
  updateProfileSchema,
  userSchema,
} from '@lifexp/shared';

export class UserResponseDto extends createZodDto(userSchema) {}
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
export class DeleteAccountDto extends createZodDto(deleteAccountSchema) {}
export class AccountExportDto extends createZodDto(accountExportSchema) {}
