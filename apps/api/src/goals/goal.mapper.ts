import type { CivilDate, Goal, GoalStatus, Milestone } from '@lifexp/shared';
import { toCivil } from '../blocks/blocks.mapper.js';
import type {
  Goal as GoalEntity,
  GoalStatus as GoalStatusEntity,
  Milestone as MilestoneEntity,
} from '../generated/prisma/client.js';
import { goalProgress, isOverdue, isReadyToComplete } from './domain/goal-rules.js';

export type GoalWithMilestones = GoalEntity & { milestones: MilestoneEntity[] };

const STATUS_TO_API: Record<GoalStatusEntity, GoalStatus> = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  PAUSED: 'paused',
  ABANDONED: 'abandoned',
};
export const STATUS_TO_DB: Record<GoalStatus, GoalStatusEntity> = {
  active: 'ACTIVE',
  completed: 'COMPLETED',
  paused: 'PAUSED',
  abandoned: 'ABANDONED',
};

export function toMilestoneResponse(milestone: MilestoneEntity): Milestone {
  return {
    id: milestone.id,
    title: milestone.title,
    done: milestone.done,
    doneAt: milestone.doneAt?.toISOString() ?? null,
    position: milestone.position,
  };
}

/** `today` é o dia civil da pessoa (RN36): o atraso depende dele (RN22). */
export function toGoalResponse(
  goal: GoalWithMilestones,
  investedMinutes: number,
  today: CivilDate,
): Goal {
  const milestones = [...goal.milestones].sort(
    (a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const progress = goalProgress({
    targetValue: goal.targetValue,
    currentValue: goal.currentValue,
    milestonesDone: milestones.filter((m) => m.done).length,
    milestonesTotal: milestones.length,
  });
  return {
    id: goal.id,
    areaId: goal.areaId,
    title: goal.title,
    description: goal.description,
    deadline: goal.deadline ? toCivil(goal.deadline) : null,
    status: STATUS_TO_API[goal.status],
    unit: goal.unit,
    targetValue: goal.targetValue,
    currentValue: goal.currentValue,
    completedAt: goal.completedAt?.toISOString() ?? null,
    overdue: isOverdue({
      status: goal.status,
      deadline: goal.deadline ? toCivil(goal.deadline) : null,
      today,
    }),
    progress,
    readyToComplete: goal.status !== 'COMPLETED' && isReadyToComplete(progress),
    milestones: milestones.map(toMilestoneResponse),
    investedMinutes,
  };
}
