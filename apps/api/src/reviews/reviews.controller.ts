import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodResponse, createZodDto } from 'nestjs-zod';
import {
  listReviewsQuerySchema,
  reviewDetailSchema,
  reviewPageSchema,
  reviewWeekParamSchema,
  updateReviewSchema,
  weeklyReviewSchema,
} from '@lifexp/shared';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ReviewsService } from './reviews.service.js';

class ReviewWeekParamDto extends createZodDto(reviewWeekParamSchema) {}
class UpdateReviewDto extends createZodDto(updateReviewSchema) {}
class ListReviewsQueryDto extends createZodDto(listReviewsQuerySchema) {}
class ReviewDetailDto extends createZodDto(reviewDetailSchema) {}
class ReviewPageDto extends createZodDto(reviewPageSchema) {}
class WeeklyReviewDto extends createZodDto(weeklyReviewSchema) {}

@ApiTags('reviews')
@ApiBearerAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOperation({
    summary: 'Revisões semanais já escritas, da mais recente à mais antiga (paginada)',
  })
  @ZodResponse({ type: ReviewPageDto })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListReviewsQueryDto) {
    return this.reviews.list(user.id, query);
  }

  @Get(':weekStart')
  @ApiOperation({
    summary:
      'Revisão de uma semana: resumo de aderência por área, a reflexão e a prioridade combinada',
  })
  @ZodResponse({ type: ReviewDetailDto })
  detail(@CurrentUser() user: AuthenticatedUser, @Param() params: ReviewWeekParamDto) {
    return this.reviews.getDetail(user.id, params.weekStart);
  }

  @Put(':weekStart')
  @ApiOperation({
    summary: 'Salva a reflexão da semana (o que deu certo, o que travou, a prioridade)',
  })
  @ZodResponse({ type: WeeklyReviewDto })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ReviewWeekParamDto,
    @Body() body: UpdateReviewDto,
  ) {
    return this.reviews.save(user.id, params.weekStart, body);
  }
}
