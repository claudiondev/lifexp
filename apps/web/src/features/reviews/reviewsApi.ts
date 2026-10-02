import {
  reviewDetailSchema,
  reviewPageSchema,
  weeklyReviewSchema,
  type CivilDate,
  type ReviewDetail,
  type ReviewPage,
  type UpdateReviewInput,
  type WeeklyReview,
} from '@lifexp/shared';
import { apiJson } from '../../lib/apiClient';

export const REVIEWS_PAGE_SIZE = 10;

export const getReview = (weekStart: CivilDate): Promise<ReviewDetail> =>
  apiJson(`/reviews/${weekStart}`, reviewDetailSchema);

/** Substitui a reflexão da semana; salvar o mesmo texto de novo não muda nada. */
export const saveReview = (weekStart: CivilDate, input: UpdateReviewInput): Promise<WeeklyReview> =>
  apiJson(`/reviews/${weekStart}`, weeklyReviewSchema, { method: 'PUT', json: input });

export const listReviews = (cursor?: CivilDate): Promise<ReviewPage> =>
  apiJson(
    `/reviews?limit=${REVIEWS_PAGE_SIZE}${cursor ? `&before=${cursor}` : ''}`,
    reviewPageSchema,
  );
