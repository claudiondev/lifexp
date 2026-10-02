import { describe, expect, it } from 'vitest';
import {
  createRewardSchema,
  rewardSchema,
  rewardTriggerSchema,
  updateRewardSchema,
} from './reward.schema.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('rewardTriggerSchema', () => {
  it('aceita os quatro tipos com os campos certos', () => {
    expect(ok(rewardTriggerSchema, { type: 'level', threshold: 5 })).toBe(true);
    expect(ok(rewardTriggerSchema, { type: 'streak', threshold: 7 })).toBe(true);
    expect(ok(rewardTriggerSchema, { type: 'total_xp', threshold: 1000 })).toBe(true);
    expect(ok(rewardTriggerSchema, { type: 'achievement', achievementKey: 'constant' })).toBe(true);
  });

  it('exige o campo do tipo e recusa o que não é dele (RS07)', () => {
    expect(ok(rewardTriggerSchema, { type: 'level' })).toBe(false);
    expect(ok(rewardTriggerSchema, { type: 'achievement', threshold: 3 })).toBe(false);
    expect(
      ok(rewardTriggerSchema, { type: 'level', threshold: 5, achievementKey: 'constant' }),
    ).toBe(false);
    expect(ok(rewardTriggerSchema, { type: 'achievement', achievementKey: 'inventada' })).toBe(
      false,
    );
    expect(ok(rewardTriggerSchema, { type: 'nada', threshold: 1 })).toBe(false);
  });

  it('limites: nível 2 a 100, streak 1 a 365, XP 1 a 1 milhão, sempre inteiros', () => {
    expect(ok(rewardTriggerSchema, { type: 'level', threshold: 1 })).toBe(false);
    expect(ok(rewardTriggerSchema, { type: 'level', threshold: 101 })).toBe(false);
    expect(ok(rewardTriggerSchema, { type: 'streak', threshold: 0 })).toBe(false);
    expect(ok(rewardTriggerSchema, { type: 'streak', threshold: 366 })).toBe(false);
    expect(ok(rewardTriggerSchema, { type: 'total_xp', threshold: 1_000_001 })).toBe(false);
    expect(ok(rewardTriggerSchema, { type: 'streak', threshold: 2.5 })).toBe(false);
  });
});

describe('createRewardSchema', () => {
  const valid = { title: 'Jantar fora', trigger: { type: 'level', threshold: 5 } };

  it('aceita título e gatilho, com descrição opcional', () => {
    expect(ok(createRewardSchema, valid)).toBe(true);
    expect(ok(createRewardSchema, { ...valid, description: 'No japonês' })).toBe(true);
    expect(ok(createRewardSchema, { ...valid, description: null })).toBe(true);
  });

  it('recusa título vazio ou longo, descrição longa e campo desconhecido', () => {
    expect(ok(createRewardSchema, { ...valid, title: '   ' })).toBe(false);
    expect(ok(createRewardSchema, { ...valid, title: 'x'.repeat(101) })).toBe(false);
    expect(ok(createRewardSchema, { ...valid, description: 'x'.repeat(501) })).toBe(false);
    expect(ok(createRewardSchema, { ...valid, redeemedAt: '2026-10-07T12:00:00.000Z' })).toBe(
      false,
    );
    expect(ok(createRewardSchema, { title: 'Sem gatilho' })).toBe(false);
  });
});

describe('updateRewardSchema', () => {
  it('só título e descrição mudam; o gatilho não', () => {
    expect(ok(updateRewardSchema, { title: 'Novo' })).toBe(true);
    expect(ok(updateRewardSchema, { description: null })).toBe(true);
    expect(ok(updateRewardSchema, { trigger: { type: 'level', threshold: 9 } })).toBe(false);
    expect(
      ok(updateRewardSchema, { title: 'Novo', trigger: { type: 'level', threshold: 9 } }),
    ).toBe(false);
    expect(ok(updateRewardSchema, { title: 'Novo', redeemedAt: '2026-10-07T12:00:00.000Z' })).toBe(
      false,
    );
    expect(ok(updateRewardSchema, {})).toBe(false);
  });

  it('pedido vazio explica o que falta', () => {
    const result = updateRewardSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Informe ao menos um campo para alterar');
  });
});

describe('rewardSchema', () => {
  const reward = {
    id: '0192f1a0-7b3c-7000-8000-0000000000a1',
    title: 'Jantar fora',
    description: null,
    trigger: { type: 'level', threshold: 5 },
    status: 'locked',
    reachedAt: null,
    redeemedAt: null,
    createdAt: '2026-10-07T12:00:00.000Z',
  };

  it('aceita os três status', () => {
    expect(ok(rewardSchema, reward)).toBe(true);
    expect(ok(rewardSchema, { ...reward, status: 'available', reachedAt: reward.createdAt })).toBe(
      true,
    );
    expect(ok(rewardSchema, { ...reward, status: 'redeemed' })).toBe(true);
    expect(ok(rewardSchema, { ...reward, status: 'quebrada' })).toBe(false);
  });
});
