import { describe, expect, it } from 'vitest';
import { PHASE_TEXT, derivePhase } from './pushState';

const base = {
  config: { enabled: true },
  configFailed: false,
  supported: true,
  permission: 'default' as NotificationPermission,
  subscribed: false as boolean | undefined,
};

describe('derivePhase', () => {
  it('carrega enquanto a configuração do servidor não chegou, e mostra erro se ela falhar', () => {
    expect(derivePhase({ ...base, config: undefined })).toBe('loading');
    expect(derivePhase({ ...base, config: undefined, configFailed: true })).toBe('error');
  });

  it('o servidor sem chaves vence tudo (não adianta pedir permissão)', () => {
    expect(
      derivePhase({ ...base, config: { enabled: false }, supported: false, permission: 'denied' }),
    ).toBe('server-off');
  });

  it('navegador sem suporte vem antes da permissão negada', () => {
    expect(derivePhase({ ...base, supported: false, permission: 'denied' })).toBe('unsupported');
  });

  it('permissão negada impede ativar, mesmo que haja uma inscrição velha', () => {
    expect(derivePhase({ ...base, permission: 'denied', subscribed: true })).toBe('denied');
  });

  it('aguarda saber se este aparelho já está inscrito', () => {
    expect(derivePhase({ ...base, subscribed: undefined })).toBe('loading');
  });

  it('inscrito ou não, com a permissão dada ou por pedir', () => {
    expect(derivePhase({ ...base, subscribed: false })).toBe('off');
    expect(derivePhase({ ...base, subscribed: true, permission: 'granted' })).toBe('on');
    expect(derivePhase({ ...base, subscribed: false, permission: 'granted' })).toBe('off');
  });
});

describe('PHASE_TEXT', () => {
  it('explica cada motivo de indisponibilidade, e o do iPhone cita instalar o app', () => {
    expect(PHASE_TEXT['server-off']).toContain('não está ligado');
    expect(PHASE_TEXT.unsupported).toContain('Tela de Início');
    expect(PHASE_TEXT.unsupported).toContain('iOS 16.4');
    expect(PHASE_TEXT.denied).toContain('bloqueou');
  });
});
