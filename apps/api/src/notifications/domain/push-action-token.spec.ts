import { describe, expect, it } from 'vitest';
import {
  actionTokenExpiry,
  checkinResultText,
  generateActionToken,
  hashActionToken,
} from './push-action-token.js';

describe('generateActionToken / hashActionToken', () => {
  it('gera tokens diferentes a cada chamada, em base64url', () => {
    const a = generateActionToken();
    const b = generateActionToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('o hash é sempre SHA-256 em hexadecimal (64 caracteres), determinístico', () => {
    const token = generateActionToken();
    const hash = hashActionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashActionToken(token)).toBe(hash);
    expect(hashActionToken(generateActionToken())).not.toBe(hash);
  });
});

describe('actionTokenExpiry', () => {
  it('é 23:59:59.999 do dia seguinte ao da ocorrência, no fuso da pessoa (igual à janela de conclusão)', () => {
    // 2026-10-07 em São Paulo (UTC-3): o dia seguinte ao seguinte começa à meia-noite de 09/10 = 03:00Z
    expect(actionTokenExpiry('2026-10-07', 'America/Sao_Paulo')).toEqual(
      new Date('2026-10-09T02:59:59.999Z'),
    );
  });

  it('acompanha o fuso', () => {
    // em Tóquio (UTC+9): meia-noite de 09/10 = 15:00Z do dia 08
    expect(actionTokenExpiry('2026-10-07', 'Asia/Tokyo')).toEqual(
      new Date('2026-10-08T14:59:59.999Z'),
    );
  });
});

describe('checkinResultText', () => {
  it('pular: título "Pulado", corpo com o nome da atividade', () => {
    expect(
      checkinResultText({
        action: 'skip',
        activityName: 'Corrida',
        xpAwarded: 0,
        leveledUp: false,
        newLevel: 0,
      }),
    ).toEqual({ title: 'Pulado', body: 'Corrida' });
  });

  it('cumprir sem subir de nível: "✓ Nome" e o XP ganho', () => {
    expect(
      checkinResultText({
        action: 'complete',
        activityName: 'Corrida',
        xpAwarded: 45,
        leveledUp: false,
        newLevel: 3,
      }),
    ).toEqual({ title: '✓ Corrida', body: '+45 XP' });
  });

  it('cumprir já estava concluído (idempotente, sem XP novo): avisa sem prometer XP', () => {
    expect(
      checkinResultText({
        action: 'complete',
        activityName: 'Corrida',
        xpAwarded: 0,
        leveledUp: false,
        newLevel: 3,
      }),
    ).toEqual({ title: '✓ Corrida', body: 'Já estava concluído' });
  });

  it('cumprir e subir de nível: comemora o nível novo em vez do XP', () => {
    expect(
      checkinResultText({
        action: 'complete',
        activityName: 'Corrida',
        xpAwarded: 45,
        leveledUp: true,
        newLevel: 6,
      }),
    ).toEqual({ title: 'Você chegou ao nível 6!', body: 'Corrida · +45 XP' });
  });
});
