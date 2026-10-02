import {
  QUEST_BONUS_CAP,
  bonusFor,
  buildSnapshot,
  evaluateQuest,
  itemKey,
  requiredCount,
  type QuestItemInput,
  type SnapshotOccurrence,
} from './quest.js';

const item = (n: number, xp = 60): QuestItemInput => ({
  blockId: `b${n}`,
  occurrenceDate: '2026-10-07',
  xp,
});
const items = (count: number, xp = 60) => Array.from({ length: count }, (_, i) => item(i + 1, xp));
const keys = (list: QuestItemInput[]) =>
  new Set(list.map((i) => itemKey(i.blockId, i.occurrenceDate)));

describe('requiredCount', () => {
  it('arredonda sempre para cima, em aritmética inteira', () => {
    expect(requiredCount(10, 80)).toBe(8);
    expect(requiredCount(5, 80)).toBe(4);
    expect(requiredCount(1, 80)).toBe(1);
    expect(requiredCount(2, 80)).toBe(2); // 1,6 sobe para 2
    expect(requiredCount(3, 80)).toBe(3); // 2,4 sobe para 3
    expect(requiredCount(4, 80)).toBe(4); // 3,2 sobe para 4
    expect(requiredCount(7, 80)).toBe(6); // 5,6 sobe para 6
    expect(requiredCount(0, 80)).toBe(0);
  });

  it('é exato onde o ponto flutuante erraria (0,8 × n)', () => {
    for (let n = 0; n <= 400; n += 1) {
      const exact = Math.floor((n * 80 + 99) / 100); // teto inteiro
      expect([n, requiredCount(n, 80)]).toEqual([n, exact]);
    }
  });

  it('as faixas de 90 e 100', () => {
    expect(requiredCount(10, 90)).toBe(9);
    expect(requiredCount(10, 100)).toBe(10);
    expect(requiredCount(7, 90)).toBe(7);
    expect(requiredCount(3, 100)).toBe(3);
  });
});

describe('bonusFor', () => {
  it('20% do XP elegível, arredondado', () => {
    expect(bonusFor(600)).toBe(120);
    expect(bonusFor(100)).toBe(20);
    expect(bonusFor(7)).toBe(1); // 1,4
    expect(bonusFor(8)).toBe(2); // 1,6
    expect(bonusFor(0)).toBe(0);
  });

  it('nunca passa do teto', () => {
    expect(bonusFor(5000)).toBe(QUEST_BONUS_CAP);
    expect(bonusFor(4995)).toBe(QUEST_BONUS_CAP - 1);
    expect(bonusFor(1_000_000)).toBe(QUEST_BONUS_CAP);
  });
});

describe('evaluateQuest', () => {
  it('10 blocos, 7 cumpridos: falta 1 para os 80%', () => {
    const all = items(10);
    const result = evaluateQuest({
      items: all,
      planned: keys(all),
      completed: keys(all.slice(0, 7)),
    });
    expect(result).toMatchObject({
      eligible: 10,
      completed: 7,
      target: 8,
      ratio: 0.7,
      met: false,
      bonusXp: 120,
    });
  });

  it('80% exatos cumprem, e as faixas acendem uma a uma', () => {
    const all = items(10);
    const at = (n: number) =>
      evaluateQuest({ items: all, planned: keys(all), completed: keys(all.slice(0, n)) });

    expect(at(8).met).toBe(true);
    expect(at(8).tiers.map((t) => t.reached)).toEqual([true, false, false]);
    expect(at(9).tiers.map((t) => t.reached)).toEqual([true, true, false]);
    expect(at(10).tiers.map((t) => t.reached)).toEqual([true, true, true]);
    expect(at(7).tiers.map((t) => t.reached)).toEqual([false, false, false]);
    expect(at(8).tiers.map((t) => t.requiredCount)).toEqual([8, 9, 10]);
    expect(at(8).tiers.map((t) => t.percent)).toEqual([80, 90, 100]);
  });

  it('com poucos blocos o arredondamento para cima vale: 3 blocos pedem os 3', () => {
    const all = items(3);
    const two = evaluateQuest({ items: all, planned: keys(all), completed: keys(all.slice(0, 2)) });
    expect(two).toMatchObject({ target: 3, met: false });
    const three = evaluateQuest({ items: all, planned: keys(all), completed: keys(all) });
    expect(three.met).toBe(true);
  });

  it('1 bloco: cumprir o único cumpre a quest', () => {
    const all = items(1);
    expect(evaluateQuest({ items: all, planned: keys(all), completed: new Set() }).met).toBe(false);
    expect(evaluateQuest({ items: all, planned: keys(all), completed: keys(all) }).met).toBe(true);
  });

  it('bloco pulado sai da conta (não pune): o alvo encolhe e o bônus também', () => {
    const all = items(10);
    const stillPlanned = keys(all.slice(0, 9)); // o 10º foi pulado
    const result = evaluateQuest({
      items: all,
      planned: stillPlanned,
      completed: keys(all.slice(0, 8)),
    });
    expect(result).toMatchObject({ eligible: 9, target: 8, completed: 8, met: true });
    expect(result.bonusXp).toBe(bonusFor(9 * 60));
  });

  it('pular pode CUMPRIR a quest que faltava um bloco (a pessoa decidiu não fazer aquele)', () => {
    const all = items(10);
    const done = keys(all.slice(0, 7));
    expect(evaluateQuest({ items: all, planned: keys(all), completed: done }).met).toBe(false);
    expect(evaluateQuest({ items: all, planned: keys(all.slice(0, 8)), completed: done }).met).toBe(
      true,
    );
  });

  it('bloco criado depois do snapshot nunca entra, nem se for cumprido (RN18)', () => {
    const all = items(5);
    const extra = item(99);
    const result = evaluateQuest({
      items: all,
      planned: keys([...all, extra]), // o plano de agora tem o bloco novo
      completed: keys([...all.slice(0, 3), extra]), // ele foi cumprido
    });
    expect(result).toMatchObject({ eligible: 5, completed: 3, target: 4, met: false });
  });

  it('conclusão de algo que saiu do plano não conta', () => {
    const all = items(5);
    const result = evaluateQuest({
      items: all,
      planned: keys(all.slice(0, 4)), // o 5º saiu do plano
      completed: keys(all), // mas ainda consta como concluído
    });
    expect(result).toMatchObject({ eligible: 4, completed: 4 });
  });

  it('sem nenhum bloco elegível não há quest: nunca "cumpre de graça"', () => {
    const all = items(4);
    const result = evaluateQuest({ items: all, planned: new Set(), completed: new Set() });
    expect(result).toMatchObject({
      eligible: 0,
      completed: 0,
      target: 0,
      ratio: null,
      met: false,
      bonusXp: 0,
    });
    expect(result.tiers.every((t) => !t.reached && t.requiredCount === 0)).toBe(true);
    expect(evaluateQuest({ items: [], planned: new Set(), completed: new Set() }).met).toBe(false);
  });

  it('a mesma data em blocos diferentes, e o mesmo bloco em datas diferentes, são itens diferentes', () => {
    const a: QuestItemInput = { blockId: 'b1', occurrenceDate: '2026-10-05', xp: 60 };
    const b: QuestItemInput = { blockId: 'b1', occurrenceDate: '2026-10-07', xp: 60 };
    const result = evaluateQuest({
      items: [a, b],
      planned: new Set([itemKey('b1', '2026-10-05'), itemKey('b1', '2026-10-07')]),
      completed: new Set([itemKey('b1', '2026-10-07')]),
    });
    expect(result).toMatchObject({ eligible: 2, completed: 1 });
  });

  it('o bônus soma o XP previsto só dos elegíveis, e respeita o teto', () => {
    const rich = items(30, 300);
    const result = evaluateQuest({ items: rich, planned: keys(rich), completed: keys(rich) });
    expect(result.bonusXp).toBe(QUEST_BONUS_CAP);
  });

  it('não altera os conjuntos recebidos', () => {
    const all = items(3);
    const planned = keys(all);
    const completed = keys(all.slice(0, 1));
    evaluateQuest({ items: all, planned, completed });
    expect(planned.size).toBe(3);
    expect(completed.size).toBe(1);
  });
});

describe('buildSnapshot', () => {
  const occ = (n: number, over: Partial<SnapshotOccurrence> = {}): SnapshotOccurrence => ({
    blockId: `b${n}`,
    occurrenceDate: '2026-10-07',
    durationMin: 60,
    activityId: 'a1',
    skipped: false,
    ...over,
  });

  it('guarda as planejadas com o XP de cada uma; as puladas ficam de fora', () => {
    const snapshot = buildSnapshot(
      [occ(1), occ(2, { skipped: true }), occ(3, { durationMin: 30 })],
      new Map([['a1', 1]]),
    );
    expect(snapshot).toEqual([
      { blockId: 'b1', occurrenceDate: '2026-10-07', durationMin: 60, xp: 60 },
      { blockId: 'b3', occurrenceDate: '2026-10-07', durationMin: 30, xp: 30 },
    ]);
  });

  it('o XP usa o peso da atividade, e o peso padrão 1 quando ela é desconhecida', () => {
    const snapshot = buildSnapshot(
      [occ(1, { activityId: 'pesada' }), occ(2, { activityId: 'sumiu' })],
      new Map([['pesada', 1.5]]),
    );
    expect(snapshot.map((i) => i.xp)).toEqual([90, 60]);
  });

  it('respeita o teto de 300 XP por ocorrência', () => {
    const [long] = buildSnapshot([occ(1, { durationMin: 720 })], new Map([['a1', 2]]));
    expect(long!.xp).toBe(300);
  });

  it('semana vazia ou só de pulados gera snapshot vazio', () => {
    expect(buildSnapshot([], new Map())).toEqual([]);
    expect(buildSnapshot([occ(1, { skipped: true })], new Map())).toEqual([]);
  });
});
