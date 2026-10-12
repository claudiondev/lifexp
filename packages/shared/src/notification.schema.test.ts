import { describe, expect, it } from 'vitest';
import {
  BLOCK_LEAD_OPTIONS,
  DEFAULT_BLOCK_LEAD_MIN,
  DEFAULT_DIGEST_TIME,
  DEFAULT_WRAPUP_TIME,
  listNotificationsQuerySchema,
  notificationPageSchema,
  notificationPreferencesSchema,
  notificationSchema,
  pushActionRequestSchema,
  pushActionResultSchema,
  updateNotificationPreferencesSchema,
} from './notification.schema.js';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

const id = '0192f1a0-7b3c-7000-8000-0000000000a1';
const notification = {
  id,
  kind: 'block',
  title: 'Corrida começa em 15 minutos',
  body: 'Das 09:00 às 10:00.',
  scheduledFor: '2026-10-07T11:45:00.000Z',
  createdAt: '2026-10-07T11:45:10.000Z',
  readAt: null,
  blockId: id,
  occurrenceDate: '2026-10-07',
  eventId: null,
};

describe('padrões (RN24)', () => {
  it('lembrete de bloco: 15 min, dentro das opções; resumo às 07:00', () => {
    expect(DEFAULT_BLOCK_LEAD_MIN).toBe(15);
    expect(BLOCK_LEAD_OPTIONS).toContain(DEFAULT_BLOCK_LEAD_MIN);
    expect(DEFAULT_DIGEST_TIME).toBe('07:00');
    expect(DEFAULT_WRAPUP_TIME).toBe('21:30');
  });
});

describe('notificationSchema', () => {
  it('aceita aviso de bloco, de evento e resumo (com e sem leitura)', () => {
    expect(ok(notificationSchema, notification)).toBe(true);
    expect(
      ok(notificationSchema, {
        ...notification,
        kind: 'event',
        blockId: null,
        occurrenceDate: null,
        eventId: id,
        readAt: '2026-10-07T12:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      ok(notificationSchema, {
        ...notification,
        kind: 'digest',
        blockId: null,
        occurrenceDate: null,
      }),
    ).toBe(true);
  });

  it('aceita aviso de check-in (como bloco) e de fechamento da noite (sem origem)', () => {
    expect(ok(notificationSchema, { ...notification, kind: 'checkin' })).toBe(true);
    expect(
      ok(notificationSchema, {
        ...notification,
        kind: 'wrapup',
        blockId: null,
        occurrenceDate: null,
      }),
    ).toBe(true);
  });

  it('rejeita tipo desconhecido e instante sem formato ISO', () => {
    expect(ok(notificationSchema, { ...notification, kind: 'sms' })).toBe(false);
    expect(ok(notificationSchema, { ...notification, createdAt: 'ontem' })).toBe(false);
    expect(ok(notificationSchema, { ...notification, occurrenceDate: '2026-02-30' })).toBe(false);
  });
});

describe('listNotificationsQuerySchema', () => {
  it('padrões: todas (não só as não lidas), 20 por página, sem cursor', () => {
    expect(listNotificationsQuerySchema.parse({})).toEqual({ unread: false, limit: 20 });
  });

  it('interpreta unread e limit vindos como texto da URL', () => {
    expect(listNotificationsQuerySchema.parse({ unread: 'true', limit: '50', before: id })).toEqual(
      {
        unread: true,
        limit: 50,
        before: id,
      },
    );
  });

  it('rejeita limite fora de 1 a 100, cursor que não é uuid e unread inválido', () => {
    for (const limit of ['0', '101', '-1', 'abc', '1.5']) {
      expect(ok(listNotificationsQuerySchema, { limit })).toBe(false);
    }
    expect(ok(listNotificationsQuerySchema, { limit: '100' })).toBe(true);
    expect(ok(listNotificationsQuerySchema, { before: 'xyz' })).toBe(false);
    expect(ok(listNotificationsQuerySchema, { unread: 'talvez' })).toBe(false);
  });
});

describe('notificationPageSchema', () => {
  it('aceita página com cursor ou sem (acabou)', () => {
    expect(ok(notificationPageSchema, { items: [notification], nextCursor: id })).toBe(true);
    expect(ok(notificationPageSchema, { items: [], nextCursor: null })).toBe(true);
    expect(ok(notificationPageSchema, { items: [] })).toBe(false);
  });
});

describe('preferências', () => {
  const prefs = {
    blockRemindersEnabled: true,
    blockLeadMin: 15,
    eventRemindersEnabled: true,
    digestEnabled: true,
    digestTime: '07:00',
    digestEmailEnabled: false,
    weeklyReportEnabled: true,
    pushEnabled: false,
    checkinEnabled: true,
    wrapupEnabled: true,
    wrapupTime: '21:30',
  };

  it('aceita o conjunto completo e só antecedências da lista', () => {
    expect(ok(notificationPreferencesSchema, prefs)).toBe(true);
    expect(ok(notificationPreferencesSchema, { ...prefs, pushEnabled: undefined })).toBe(false);
    expect(ok(notificationPreferencesSchema, { ...prefs, weeklyReportEnabled: undefined })).toBe(
      false,
    );
    for (const blockLeadMin of BLOCK_LEAD_OPTIONS) {
      expect(ok(notificationPreferencesSchema, { ...prefs, blockLeadMin })).toBe(true);
    }
    for (const blockLeadMin of [0, 1, 20, 45, 120]) {
      expect(ok(notificationPreferencesSchema, { ...prefs, blockLeadMin })).toBe(false);
    }
  });

  it('a hora do resumo é HH:mm', () => {
    expect(ok(notificationPreferencesSchema, { ...prefs, digestTime: '23:59' })).toBe(true);
    expect(ok(notificationPreferencesSchema, { ...prefs, digestTime: '24:00' })).toBe(false);
    expect(ok(notificationPreferencesSchema, { ...prefs, digestTime: '7:00' })).toBe(false);
  });

  it('a atualização é parcial: exige ao menos um campo e recusa campo desconhecido', () => {
    expect(ok(updateNotificationPreferencesSchema, {})).toBe(false);
    expect(ok(updateNotificationPreferencesSchema, { digestEmailEnabled: true })).toBe(true);
    expect(ok(updateNotificationPreferencesSchema, { pushEnabled: true })).toBe(true);
    expect(ok(updateNotificationPreferencesSchema, { weeklyReportEnabled: false })).toBe(true);
    expect(ok(updateNotificationPreferencesSchema, { pushEnabled: 'sim' })).toBe(false);
    expect(ok(updateNotificationPreferencesSchema, { blockLeadMin: 30, digestTime: '06:30' })).toBe(
      true,
    );
    expect(ok(updateNotificationPreferencesSchema, { blockLeadMin: 20 })).toBe(false);
    expect(ok(updateNotificationPreferencesSchema, { userId: id })).toBe(false);
    expect(ok(updateNotificationPreferencesSchema, { digestEnabled: 'sim' })).toBe(false);
    expect(ok(updateNotificationPreferencesSchema, { checkinEnabled: false })).toBe(true);
    expect(ok(updateNotificationPreferencesSchema, { wrapupTime: '21:30' })).toBe(true);
    expect(ok(updateNotificationPreferencesSchema, { wrapupTime: '24:00' })).toBe(false);
  });
});

describe('push-actions (RF41)', () => {
  it('pede token e uma das duas ações', () => {
    expect(ok(pushActionRequestSchema, { token: 'abc', action: 'complete' })).toBe(true);
    expect(ok(pushActionRequestSchema, { token: 'abc', action: 'skip' })).toBe(true);
    expect(ok(pushActionRequestSchema, { token: 'abc', action: 'snooze' })).toBe(false);
    expect(ok(pushActionRequestSchema, { token: '', action: 'skip' })).toBe(false);
    expect(ok(pushActionRequestSchema, { action: 'skip' })).toBe(false);
    expect(ok(pushActionRequestSchema, { token: 'abc', action: 'skip', extra: 1 })).toBe(false);
  });

  it('o resultado é só o texto para o aviso de confirmação', () => {
    expect(ok(pushActionResultSchema, { title: '✓ Corrida', body: '+30 XP' })).toBe(true);
    expect(ok(pushActionResultSchema, { title: '✓ Corrida' })).toBe(false);
  });
});
