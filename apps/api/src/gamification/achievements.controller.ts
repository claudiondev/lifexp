import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import { achievementListSchema } from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AchievementsService } from './achievements.service.js';

class AchievementListDto extends createZodDto(achievementListSchema) {}

@ApiTags('gamification')
@ApiBearerAuth()
@Controller('achievements')
export class AchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @Get()
  @ApiOperation({ summary: 'As conquistas do catálogo: desbloqueadas, bloqueadas e o progresso' })
  @ZodResponse({ type: AchievementListDto })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.achievements.list(user.id);
  }
}
