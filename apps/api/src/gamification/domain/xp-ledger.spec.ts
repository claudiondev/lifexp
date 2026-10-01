import { applyXpDelta, sumLedger } from './xp-ledger.js';

describe('sumLedger (RN29): o livro-caixa é a fonte da verdade', () => {
  it('livro vazio soma zero', () => {
    expect(sumLedger([])).toEqual({ total: 0, byArea: new Map() });
  });

  it('soma conclusões e subtrai estornos, no total e por área', () => {
    const { total, byArea } = sumLedger([
      { areaId: 'trabalho', amount: 60 },
      { areaId: 'estudo', amount: 45 },
      { areaId: 'trabalho', amount: 30 },
      { areaId: 'trabalho', amount: -60 }, // estorno da primeira
    ]);
    expect(total).toBe(75);
    expect(byArea.get('trabalho')).toBe(30);
    expect(byArea.get('estudo')).toBe(45);
  });

  it('uma conclusão e o seu estorno se anulam', () => {
    const { total, byArea } = sumLedger([
      { areaId: 'fe', amount: 120 },
      { areaId: 'fe', amount: -120 },
    ]);
    expect(total).toBe(0);
    expect(byArea.get('fe')).toBe(0);
  });

  it('lançamentos sem área contam no total, mas não em nenhuma área', () => {
    const { total, byArea } = sumLedger([
      { areaId: null, amount: 100 },
      { areaId: 'saude', amount: 20 },
    ]);
    expect(total).toBe(120);
    expect([...byArea.keys()]).toEqual(['saude']);
  });

  it('a soma por área sempre fecha com o total quando todos os lançamentos têm área', () => {
    const entries = Array.from({ length: 200 }, (_, index) => ({
      areaId: ['a', 'b', 'c'][index % 3] as string,
      amount: index % 5 === 0 ? -(index % 40) : (index % 60) + 1,
    }));
    const { total, byArea } = sumLedger(entries);
    expect([...byArea.values()].reduce((sum, value) => sum + value, 0)).toBe(total);
  });

  it('não depende da ordem dos lançamentos', () => {
    const entries = [
      { areaId: 'a', amount: 60 },
      { areaId: 'b', amount: 10 },
      { areaId: 'a', amount: -60 },
      { areaId: 'b', amount: 5 },
    ];
    expect(sumLedger([...entries].reverse())).toEqual(sumLedger(entries));
  });

  it('não altera a lista recebida', () => {
    const entries = [{ areaId: 'a', amount: 1 }];
    const copy = JSON.stringify(entries);
    sumLedger(entries);
    expect(JSON.stringify(entries)).toBe(copy);
  });
});

describe('applyXpDelta', () => {
  it('ganhar XP informa o antes e o depois, sem mudar de nível', () => {
    expect(applyXpDelta(0, 60)).toEqual({ before: 0, after: 60, levelBefore: 1, levelAfter: 1 });
  });

  it('cruzar o limite de nível mostra a subida (para a comemoração)', () => {
    expect(applyXpDelta(60, 40)).toEqual({ before: 60, after: 100, levelBefore: 1, levelAfter: 2 });
    expect(applyXpDelta(99, 1).levelAfter).toBe(2);
    expect(applyXpDelta(98, 1).levelAfter).toBe(1);
  });

  it('uma conclusão grande pode subir mais de um nível de uma vez', () => {
    const change = applyXpDelta(90, 300); // 390 XP: nível 3 vai de 283 a 520
    expect(change.levelBefore).toBe(1);
    expect(change.levelAfter).toBe(3);
  });

  it('o estorno devolve o XP e pode descer de nível (correção técnica, não punição)', () => {
    expect(applyXpDelta(100, -60)).toEqual({
      before: 100,
      after: 40,
      levelBefore: 2,
      levelAfter: 1,
    });
  });

  it('variação zero não muda nada', () => {
    expect(applyXpDelta(250, 0)).toMatchObject({
      before: 250,
      after: 250,
      levelBefore: 2,
      levelAfter: 2,
    });
  });

  it('recusa deixar o XP negativo: seria um estorno sem a conclusão correspondente', () => {
    expect(() => applyXpDelta(50, -60)).toThrow(RangeError);
    expect(() => applyXpDelta(0, -1)).toThrow(/negativo/);
  });

  it('chegar a exatamente zero é permitido', () => {
    expect(applyXpDelta(60, -60).after).toBe(0);
  });
});
